// Downloads vuejs into the static folder
const staticPath = "static/";
const filePath = "vue.js";
const downloadUrl = "https://cdn.jsdelivr.net/npm/vue@2.5.17/dist/vue.js";

var http = require("https");
var fs = require("fs");

var download = function(url, dest, cb) {
  var file = fs.createWriteStream(dest);
  var request = http
    .get(url, function(response) {
      response.pipe(file);
      file.on("finish", function() {
        file.close(cb); // close() is async, call cb after close completes.
      });
    })
    .on("error", function(err) {
      // Handle errors
      fs.unlink(dest); // Delete the file async. (But we don't check the result)
      if (cb) cb(err.message);
    });
};

download(downloadUrl, staticPath + filePath, console.log);
