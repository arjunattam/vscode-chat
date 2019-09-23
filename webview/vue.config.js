module.exports = {
    publicPath: './', // This is required to serve build output w/o an HTTP server
    runtimeCompiler: true, // This is required to be able to use template tags
    filenameHashing: false, // Pin names so we can import them easiy
    outputDir: '../static'
}
