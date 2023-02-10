#!/usr/bin/env node

const fs = require("fs");
const sharp = require("sharp");
const { createHash } = require("crypto");
const path = require("path");
const cliProgress = require("cli-progress");

const loadConfig = require("next/dist/server/config").default;

process.env.NODE_ENV = "production";

// Check if the --name and --age arguments are present
const nextConfigPathIndex = process.argv.indexOf("--nextConfigPath");
const exportFolderPathIndex = process.argv.indexOf("--exportFolderPath");

// Check if there is only one argument without a name present -> this is the case if the user does not provide the path to the next.config.js file
if (process.argv.length === 3) {
  // Colorize the output to red
  // Colorize the output to red
  console.error("\x1b[31m");
  console.error(
    "next-image-export-optimizer: Breaking change: Please provide the path to the next.config.js file as an argument with the name --nextConfigPath."
  );
  // Reset the color
  console.error("\x1b[0m");
  process.exit(1);
}

// Set the nextConfigPath and exportFolderPath variables to the corresponding arguments, or to undefined if the arguments are not present
let nextConfigPath =
  nextConfigPathIndex !== -1
    ? process.argv[nextConfigPathIndex + 1]
    : undefined;
let exportFolderPathCommandLine =
  exportFolderPathIndex !== -1
    ? process.argv[exportFolderPathIndex + 1]
    : undefined;

if (nextConfigPath) {
  nextConfigPath = path.isAbsolute(nextConfigPath)
    ? nextConfigPath
    : path.join(process.cwd(), nextConfigPath);
} else {
  nextConfigPath = path.join(process.cwd(), "next.config.js");
}

if (exportFolderPathCommandLine) {
  exportFolderPathCommandLine = path.isAbsolute(exportFolderPathCommandLine)
    ? exportFolderPathCommandLine
    : path.join(process.cwd(), exportFolderPathCommandLine);
}

function getHash(items) {
  const hash = createHash("sha256");
  for (let item of items) {
    if (typeof item === "number") hash.update(String(item));
    else {
      hash.update(item);
    }
  }
  // See https://en.wikipedia.org/wiki/Base64#Filenames
  return hash.digest("base64").replace(/\//g, "-");
}

const getAllFiles = function (
  basePath,
  dirPath,
  exportFolderName,
  arrayOfFiles
) {
  arrayOfFiles = arrayOfFiles || [];
  // check if the path is existing
  if (fs.existsSync(dirPath)) {
    let files = fs.readdirSync(dirPath);

    files.forEach(function (file) {
      if (
        fs.statSync(dirPath + "/" + file).isDirectory() &&
        file !== exportFolderName &&
        file !== "nextImageExportOptimizer" // default export folder name
      ) {
        arrayOfFiles = getAllFiles(
          basePath,
          dirPath + "/" + file,
          exportFolderName,
          arrayOfFiles
        );
      } else {
        const dirPathWithoutBasePath = dirPath
          .replace(basePath, "") // remove the basePath for later path composition
          .replace(/^(\/)/, ""); // remove the first trailing slash if there is one at the first position
        arrayOfFiles.push({ basePath, dirPathWithoutBasePath, file });
      }
    });
  }

  return arrayOfFiles;
};

function ensureDirectoryExists(filePath) {
  const dirName = path.dirname(filePath);
  if (fs.existsSync(dirName)) {
    return true;
  }
  ensureDirectoryExists(dirName);
  fs.mkdirSync(dirName);
}

const nextImageExportOptimizer = async function () {
  console.log(
    "---- next-image-export-optimizer: Begin with optimization... ---- "
  );

  // Default values
  let imageFolderPath = "public/images";
  let staticImageFolderPath = ".next/static/media";
  let exportFolderPath = "out";
  let deviceSizes = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
  let imageSizes = [16, 32, 48, 64, 96, 128, 256, 384];
  let quality = 75;
  let storePicturesInWEBP = true;
  let blurSize = [];
  let exportFolderName = "nextImageExportOptimizer";
  try {
    // Read in the configuration parameters
    const nextjsConfig = await loadConfig(
      "phase-export",
      nextConfigPath.replace("next.config.js", "")
    );

    // Check if nextjsConfig is an object or is undefined
    if (typeof nextjsConfig !== "object" || nextjsConfig === null) {
      throw new Error("next.config.js is not an object");
    }
    const legacyPath = nextjsConfig.images?.nextImageExportOptimizer;
    const newPath = nextjsConfig.env;

    if (legacyPath?.imageFolderPath !== undefined) {
      imageFolderPath = legacyPath.imageFolderPath;
    } else if (
      newPath?.nextImageExportOptimizer_imageFolderPath !== undefined
    ) {
      imageFolderPath = newPath.nextImageExportOptimizer_imageFolderPath;
    }
    if (legacyPath?.exportFolderPath !== undefined) {
      exportFolderPath = legacyPath.exportFolderPath;
    } else if (
      newPath?.nextImageExportOptimizer_exportFolderPath !== undefined
    ) {
      exportFolderPath = newPath.nextImageExportOptimizer_exportFolderPath;
    }
    if (nextjsConfig.images?.deviceSizes !== undefined) {
      deviceSizes = nextjsConfig.images.deviceSizes;
    }
    if (nextjsConfig.images?.imageSizes !== undefined) {
      imageSizes = nextjsConfig.images.imageSizes;
    }
    if (nextjsConfig.distDir !== undefined) {
      staticImageFolderPath = path.join(nextjsConfig.distDir, "static/media");
    }

    if (legacyPath?.quality !== undefined) {
      quality = legacyPath.quality;
    } else if (newPath?.nextImageExportOptimizer_quality !== undefined) {
      quality = newPath.nextImageExportOptimizer_quality;
    }
    if (nextjsConfig.env?.storePicturesInWEBP !== undefined) {
      storePicturesInWEBP = nextjsConfig.env.storePicturesInWEBP;
    } else if (
      newPath?.nextImageExportOptimizer_storePicturesInWEBP !== undefined
    ) {
      storePicturesInWEBP =
        newPath.nextImageExportOptimizer_storePicturesInWEBP;
    }
    if (nextjsConfig.env?.generateAndUseBlurImages !== undefined) {
      blurSize = [10];
    } else if (
      newPath?.nextImageExportOptimizer_generateAndUseBlurImages !== undefined
    ) {
      blurSize = [10];
    }
    if (newPath.nextImageExportOptimizer_exportFolderName !== undefined) {
      exportFolderName = newPath.nextImageExportOptimizer_exportFolderName;
    }
    // Give the user a warning if the transpilePackages: ["next-image-export-optimizer"], is not set in the next.config.js
    if (
      nextjsConfig.transpilePackages === undefined || // transpilePackages is not set
      (nextjsConfig.transpilePackages !== undefined &&
        !nextjsConfig.transpilePackages.includes("next-image-export-optimizer")) // transpilePackages is set but does not include next-image-export-optimizer
    ) {
      console.warn(
        "\x1b[41m",
        `Changed in 1.2.0: You have not set transpilePackages: ["next-image-export-optimizer"] in your next.config.js. This may cause problems with next-image-export-optimizer. Please add this line to your next.config.js.`,
        "\x1b[0m"
      );
    }
  } catch (e) {
    // Configuration file not found
    console.log("Could not find a next.config.js file. Use of default values");
  }

  // if the user has specified a path for the export folder via the command line, use this path
  exportFolderPath = exportFolderPathCommandLine || exportFolderPath;

  // Give the user a warning, if the public directory of Next.js is not found as the user
  // may have run the command in a wrong directory
  if (
    !fs.existsSync(
      path.join(nextConfigPath.replace("next.config.js", ""), "public")
    )
  ) {
    console.warn(
      "\x1b[41m",
      `Could not find a public folder in this directory. Make sure you run the command in the main directory of your project.`,
      "\x1b[0m"
    );
  }

  // Create the folder for the optimized images if it does not exists
  const folderNameForOptImages = `${imageFolderPath}/${exportFolderName}`;
  try {
    if (!fs.existsSync(folderNameForOptImages)) {
      fs.mkdirSync(folderNameForOptImages);
      console.log(`Create image output folder: ${folderNameForOptImages}`);
    }
  } catch (err) {
    console.error(err);
  }

  // Create or read the JSON containing the hashes of the images in the image directory
  let imageHashes = {};
  const hashFilePath = `${imageFolderPath}/next-image-export-optimizer-hashes.json`;
  try {
    let rawData = fs.readFileSync(hashFilePath);
    imageHashes = JSON.parse(rawData);
  } catch (e) {
    // No image hashes yet
  }

  const allFilesInImageFolderAndSubdirectories = getAllFiles(
    imageFolderPath,
    imageFolderPath,
    exportFolderName
  );
  const allFilesInStaticImageFolder = getAllFiles(
    staticImageFolderPath,
    staticImageFolderPath,
    exportFolderName
  );
  // append the static image folder to the image folder
  allFilesInImageFolderAndSubdirectories.push(...allFilesInStaticImageFolder);

  const allImagesInImageFolder = allFilesInImageFolderAndSubdirectories.filter(
    (fileObject) => {
      let extension = fileObject.file.split(".").pop().toUpperCase();
      // Only include file with image extensions
      return ["JPG", "JPEG", "WEBP", "PNG", "AVIF", "GIF"].includes(extension);
    }
  );
  console.log(
    `Found ${allImagesInImageFolder.length} supported images in ${imageFolderPath}, static folder and subdirectories.`
  );

  const widths = [...blurSize, ...imageSizes, ...deviceSizes];

  const progressBar = new cliProgress.SingleBar(
    {
      stopOnComplete: true,
      format: (options, params, payload) => {
        const bar = options.barCompleteString.substring(
          0,
          Math.round(params.progress * options.barsize)
        );
        const percentage = Math.floor(params.progress * 100) + "";
        const progressString = `${bar} ${percentage}% | ETA: ${params.eta}s | ${params.value}/${params.total} | Total size: ${payload.sizeOfGeneratedImages} MB`;

        const stopTime = params.stopTime || Date.now();

        // calculate elapsed time
        const elapsedTime = Math.round(stopTime - params.startTime);
        function msToTime(ms) {
          let seconds = (ms / 1000).toFixed(1);
          let minutes = (ms / (1000 * 60)).toFixed(1);
          let hours = (ms / (1000 * 60 * 60)).toFixed(1);
          let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1);
          if (seconds < 60) return seconds + " seconds";
          else if (minutes < 60) return minutes + " minutes";
          else if (hours < 24) return hours + " hours";
          else return days + " days";
        }

        if (params.value >= params.total) {
          return (
            progressString +
            `\nFinished optimization in: ${msToTime(elapsedTime)}`
          );
        } else {
          return progressString;
        }
      },
    },
    cliProgress.Presets.shades_classic
  );
  if (allImagesInImageFolder.length > 0) {
    console.log(`Using sizes: ${widths.toString()}`);
    console.log(
      `Start optimization of ${allImagesInImageFolder.length} images with ${
        widths.length
      } sizes resulting in ${
        allImagesInImageFolder.length * widths.length
      } optimized images...`
    );
    progressBar.start(allImagesInImageFolder.length * widths.length, 0, {
      sizeOfGeneratedImages: 0,
    });
  }
  let sizeOfGeneratedImages = 0;
  const allGeneratedImages = [];

  const updatedImageHashes = {};

  // Loop through all images
  for (let index = 0; index < allImagesInImageFolder.length; index++) {
    // try catch to catch errors in the loop and let the user know which image caused the error
    try {
      const file = allImagesInImageFolder[index].file;
      let fileDirectory = allImagesInImageFolder[index].dirPathWithoutBasePath;
      let basePath = allImagesInImageFolder[index].basePath;

      let extension = file.split(".").pop().toUpperCase();
      const imageBuffer = fs.readFileSync(
        path.join(basePath, fileDirectory, file)
      );
      const imageHash = getHash([
        imageBuffer,
        ...widths,
        quality,
        fileDirectory,
        file,
      ]);
      const keyForImageHashes = `${fileDirectory}/${file}`;

      let hashContentChanged = false;
      if (imageHashes[keyForImageHashes] !== imageHash) {
        hashContentChanged = true;
      }
      // Store image hash in temporary object
      updatedImageHashes[keyForImageHashes] = imageHash;

      let optimizedOriginalWidthImagePath;
      let optimizedOriginalWidthImageSizeInMegabytes;

      // Loop through all widths
      for (let indexWidth = 0; indexWidth < widths.length; indexWidth++) {
        const width = widths[indexWidth];

        const filename = path.parse(file).name;
        if (storePicturesInWEBP) {
          extension = "WEBP";
        }

        // for a static image, we copy the image to public/nextImageExportOptimizer or public/${exportFolderName}
        // and not the staticImageFolderPath
        // as the static image folder is deleted before each build
        const basePathToStoreOptimizedImages =
          basePath === staticImageFolderPath ? "public" : basePath;
        const optimizedFileNameAndPath = path.join(
          basePathToStoreOptimizedImages,
          fileDirectory,
          exportFolderName,
          `${filename}-opt-${width}.${extension.toUpperCase()}`
        );

        // Check if file is already in hash and specific size and quality is present in the
        // opt file directory
        if (
          !hashContentChanged &&
          keyForImageHashes in imageHashes &&
          fs.existsSync(optimizedFileNameAndPath)
        ) {
          const stats = fs.statSync(optimizedFileNameAndPath);
          const fileSizeInBytes = stats.size;
          const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
          sizeOfGeneratedImages += fileSizeInMegabytes;
          progressBar.increment({
            sizeOfGeneratedImages: sizeOfGeneratedImages.toFixed(1),
          });
          allGeneratedImages.push(optimizedFileNameAndPath);

          continue;
        }

        // If the original image's width is X, the optimized images are
        // identical for all widths >= X. Once we have generated the first of
        // these identical images, we can simply copy that file instead of redoing
        // the optimization.
        if (
          optimizedOriginalWidthImagePath &&
          optimizedOriginalWidthImageSizeInMegabytes
        ) {
          fs.copyFileSync(
            optimizedOriginalWidthImagePath,
            optimizedFileNameAndPath
          );

          sizeOfGeneratedImages += optimizedOriginalWidthImageSizeInMegabytes;
          progressBar.increment({
            sizeOfGeneratedImages: sizeOfGeneratedImages.toFixed(1),
          });
          allGeneratedImages.push(optimizedFileNameAndPath);

          continue;
        }

        // Begin sharp transformation logic
        const transformer = sharp(imageBuffer, {
          animated: true,
        });

        transformer.rotate();

        const { width: metaWidth } = await transformer.metadata();

        const resize = metaWidth && metaWidth > width;
        if (resize) {
          transformer.resize(width);
        }

        if (extension === "AVIF") {
          if (transformer.avif) {
            const avifQuality = quality - 15;
            transformer.avif({
              quality: Math.max(avifQuality, 0),
              chromaSubsampling: "4:2:0", // same as webp
            });
          } else {
            transformer.webp({ quality });
          }
        } else if (extension === "WEBP" || storePicturesInWEBP) {
          transformer.webp({ quality });
        } else if (extension === "PNG") {
          transformer.png({ quality });
        } else if (extension === "JPEG" || extension === "JPG") {
          transformer.jpeg({ quality });
        }

        // Write the optimized image to the file system
        ensureDirectoryExists(optimizedFileNameAndPath);
        const info = await transformer.toFile(optimizedFileNameAndPath);
        const fileSizeInBytes = info.size;
        const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
        sizeOfGeneratedImages += fileSizeInMegabytes;
        progressBar.increment({
          sizeOfGeneratedImages: sizeOfGeneratedImages.toFixed(1),
        });
        allGeneratedImages.push(optimizedFileNameAndPath);

        if (!resize) {
          optimizedOriginalWidthImagePath = optimizedFileNameAndPath;
          optimizedOriginalWidthImageSizeInMegabytes = fileSizeInMegabytes;
        }
      }
    } catch (error) {
      console.log(
        `
      Error while optimizing image ${allImagesInImageFolder[index].file}
      ${error}
      `
      );
      // throw the error so that the process stops
      throw error;
    }
  }
  let data = JSON.stringify(updatedImageHashes, null, 4);
  fs.writeFileSync(hashFilePath, data);

  // Copy the optimized images to the build folder

  console.log("Copy optimized images to build folder...");
  for (let index = 0; index < allGeneratedImages.length; index++) {
    const filePath = allGeneratedImages[index];
    const fileInBuildFolder = path.join(
      exportFolderPath,
      filePath.split("public").pop()
    );

    // Create the folder for the optimized images in the build directory if it does not exists
    ensureDirectoryExists(fileInBuildFolder);
    fs.copyFileSync(filePath, fileInBuildFolder);
  }
  console.log("---- next-image-export-optimizer: Done ---- ");
};

if (require.main === module) {
  nextImageExportOptimizer();
}
module.exports = nextImageExportOptimizer;
