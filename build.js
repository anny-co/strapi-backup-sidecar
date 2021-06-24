/**
 * Build script for building sidecar container from nodejs
 */

const REGISTRY = "ghcr.io";
const REPO = "anny.co/strapi-backup-sidecar";

const fs = require("fs").promises;
const yargs = require("yargs");
const execa = require("execa");
const semver = require("semver");

function dockerExec(args) {
  console.log(`docker ${args.join(" ")}`);
  return execa("docker", args, {
    stdio: "inherit",
  });
}

async function getVersionFromPackage() {
  const { version } = JSON.parse(await fs.readFile("./package.json"));
  return version;
}

async function buildImages({ version } = {}) {
  if (version === "latest" || !version) {
    version = await getVersionFromPackage();
  }

  if (semver.valid(version) === null) {
    throw new Error("Invalid version provided: " + version);
  }

  let imageName = `${REGISTRY}/${REPO}/${version}`;
  let latestImageName = `${REGISTRY}/${REPO}:latest`;

  // build current semver
  await dockerExec(["build", "-t", imageName, "."]);

  // tag current image as latest build
  await dockerExec(["tag", imageName, latestImageName]);

  await Promise.all([
    dockerExec(["push", imageName]),
    dockerExec(["push", latestImageName]),
  ]);

  await dockerExec(["image", "rm", imageName, latestImageName]);

  return [imageName, latestImageName];
}

async function run() {
  const version = argv.imageVersion;

  const tags = await buildImages({ version });

  console.log("Built and pushed images to");
  console.log(tags.map((t) => "- " + t).join("\n"));
}

const argv = yargs
  .option("imageVersion", {
    describe: "Package version to build",
    default: "latest",
    type: "string",
  })
  .version("false")
  .help("h")
  .alias("h", "help").argv;

if (argv.help) {
  yargs.showHelp();
  return;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
