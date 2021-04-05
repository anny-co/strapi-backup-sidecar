const fs = require("fs").promises;
const { join } = require("path");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const cron = require("node-cron");
const tar = require("tar");
const dayjs = require("dayjs");
const { kebabCase } = require("lodash");

const winston = require("winston");
const { combine, timestamp, prettyPrint } = winston.format;

const logger = winston.createLogger({
  level: "debug",
  formats: combine(timestamp, prettyPrint),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "backup.log" }),
  ],
});

const bucketName = process.env.AWS_BUCKET;
const schedule = process.env.BACKUP_SCHEDULE || "0 */6 * * *";

const uploadToS3 = process.env.BACKUP_UPLOAD_TO_S3_ENABLED == true;

const appDirectory = process.env.APP_DIR;
const backupDir = process.env.BACKUP_DIR;
const configFile = process.env.CONFIG_FILE;
const appFullname = process.env.APP_FULLNAME;
const backupPathPrefix = process.env.BACKUP_PATH_PREFIX;

/**
 * Main worker - runs the backup routine on a given schedule
 */
cron.schedule(schedule, async () => {
  try {
    const start = dayjs();
    const filenames = ["api", "public", "config", "components"];

    // dump current strapi config to $BACKUP_DIR
    try {
      await exec(
        `yarn strapi configuration:dump --pretty --file ${backupDir}/${configFile}`,
        {
          cwd: appDirectory,
        }
      );
    } catch (err) {
      logger.error(
        "Failed to dump config, falling back to existing config file"
      );
      try {
        await fs.access(join(backupDir, configFile));
        logger.info("Pre-dumped config exists, using this file as fallback");
      } catch (err) {
        logger.error(
          "Pre-dumped config does NOT exist, falling back to empty JSON file"
        );
        await fs.writeFile(join(backupDir, configFile), "{}");
      }
    }

    // directory to write the archive to
    const archiveDirectory = join(backupDir, "archives");

    // archive with timestamp as unix
    const archiveName = kebabCase(`${appFullname}-backup-${start.unix()}.tgz`);

    // create a tarball w/ gzip in $BACKUP_DIR/archives/
    await tar.create(
      {
        gzip: true,
        cwd: archiveDirectory,
        file: archiveName,
      },
      [
        ...filenames.map((p) => join(appDirectory, p)),
        join(backupDir, configFile),
      ]
    );

    logger.info(`Bundled tarball to ${archiveName}`);

    // S3 upload of archive
    if (uploadToS3) {
      if (!bucketName) {
        throw new Error("Missing bucket name");
      }
      const archiveBuffer = await fs.readFile(
        join(archiveDirectory, archiveName)
      );
      const uploadParams = {
        Bucket: bucketName,
        Key: backupPathPrefix + "/" + archiveName,
        Body: archiveBuffer,
        ContentType: "application/gzip",
      };
      const s3 = new S3Client();
      await s3.send(new PutObjectCommand(uploadParams));
      logger.info("Uploaded archive", {
        name: archiveName,
        prefix: backupPathPrefix,
        dir: backupDir,
      });
    } else {
      logger.info("UploadToS3 option is not specified, skipping...");
    }

    // move backup archive to "latest"
    logger.info("Replacing :latest archive");
    await fs.rename(
      join(archiveDirectory, archiveName), // temporary one with timestamp
      join(archiveDirectory, kebabCase(`${appFullname}-backup-latest.tgz`)) // latest one
    );

    const end = dayjs();

    logger.info("Finished backup run", {
      duration: end.diff(start, "seconds"),
      unit: "seconds",
    });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
});
