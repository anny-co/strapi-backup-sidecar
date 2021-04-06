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
  formats: combine(timestamp(), prettyPrint()),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "backup.log" }),
  ],
});

const bucketName = process.env.AWS_BUCKET;
const region = process.env.AWS_DEFAULT_REGION;

const schedule = process.env.BACKUP_SCHEDULE || "* * * * *";

const uploadToS3 = process.env.BACKUP_UPLOAD_TO_S3_ENABLED === "true";

const appDirectory = process.env.APP_DIR;
const backupDir = process.env.BACKUP_DIR || "/backup";
const configFile = process.env.CONFIG_FILE || "strapi.config.json";
const appFullname = process.env.APP_FULLNAME;
const backupPathPrefix = process.env.BACKUP_PATH_PREFIX;

/**
 * Main worker - runs the backup routine on a given schedule
 */
cron.schedule(schedule, async () => {
  try {
    logger.info("Starting backup cycle");
    const start = dayjs();
    const filenames = [
      "api",
      "public",
      "config",
      "components",
      "strapi.config.json",
    ];

    // dump current strapi config to $BACKUP_DIR
    logger.info("Dumping strapi config file to backup directory");
    try {
      await exec(
        `yarn strapi configuration:dump --pretty --file ${appDirectory}/${configFile}`,
        {
          cwd: appDirectory,
        }
      );
      logger.info("Dumped strapi config file");
    } catch (err) {
      logger.error(
        "Failed to dump config, falling back to existing config file"
      );
      try {
        await fs.access(join(appDirectory, configFile));
        logger.info("Pre-dumped config exists, using this file as fallback");
      } catch (err) {
        logger.error(
          "Pre-dumped config does NOT exist, falling back to empty JSON file"
        );
        await fs.writeFile(join(appDirectory, configFile), "{}");
      }
    }

    // directory to write the archive to
    const archiveDirectory = backupDir;

    // archive with timestamp as unix
    const archiveName =
      kebabCase(`${appFullname}-backup-${start.unix()}`) + ".tgz";

    // create a tarball w/ gzip in $BACKUP_DIR/archives/
    await tar.create(
      {
        gzip: true,
        cwd: appDirectory,
        file: join(backupDir, archiveName),
      },
      filenames
    );

    logger.info(`Bundled tarball to ${archiveName}`, {
      dir: archiveDirectory,
      file: archiveName,
    });

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
      const s3 = new S3Client({
        region: region,
      });
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
      join(archiveDirectory, kebabCase(`${appFullname}-backup-latest`) + ".tgz") // latest one
    );

    const end = dayjs();

    logger.info("Finished backup run", {
      duration: end.diff(start, "seconds"),
      unit: "seconds",
    });
  } catch (err) {
    logger.error(err.message, { err });
    process.exit(1);
  }
});

logger.info(`Added cronjob with schedule ${schedule}`);
