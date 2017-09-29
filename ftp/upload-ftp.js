var fs = require('fs');
var Client = require('ftp');
var readline = require('readline');
var config = require('./ftp.config.js');

//获取命令行参数
var env = JSON.parse(process.env.npm_config_argv).cooked[1].replace('ftp:', '');

//本地目录&远程目录
var localPath = config[env]['localPath'];
var remotePath = config[env]['remotePath'];

//失败的文件
var failedFiles = [];
var failedFlag = false;

//上传起始与结束输出
var startLine = 'upload start--------------------------------------';
var endLine = 'upload end----------------------------------------';

if(config[env]){
  var c = new Client();
  c.on('ready', () => {
    console.log(startLine);
    if(failedFlag) {
      var tempArr = failedFiles;
      failedFiles = [];
      reupload(tempArr);
    }else{
      upload(localPath);
    }
    c.end();
  });

  c.on('close', () => {
    console.log(endLine);
    if(failedFiles.length > 0) { 
      failedFlag = true;
      var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      //上传失败文件提示重传
      rl.question('Some files upload failed, would you like to try again(y/n) ? ', (answer) => {
        answer = answer.toLowerCase();
        if(answer == 'y' || answer == 'yes') {
          c.connect(config[env]);
        }
        rl.close();
      });
    }else{
      console.log('All files upload success');
    }
  });
  c.connect(config[env]);
}

function putFile(readStream, desdir, path) {
  c.put(readStream, desdir, (err) => {
    if(err) {
      console.log('\u001b[31m fail' + '    \u001b[39m' + path);
      failedFiles.push({
        readStream: readStream,
        desdir: desdir,
        path: path
      });
      console.log('\u001b[31m' + err);
    }else{
      console.log('\x1B[32m success' + '    \u001b[39m' + path);
    }
  });
}

function uploadFiles(path, dirIndex){
  if(fs.existsSync(path)) {  
    if(fs.statSync(path).isDirectory()) {
      var files = [];  
      files = fs.readdirSync(path);  
      files.forEach((file, index) => {  
          var curPath = path + '/' + file;  
          if(fs.statSync(curPath).isDirectory()) { // recurse  
              uploadFiles(curPath, dirIndex); 
          } else { // put file  
              putFile(fs.createReadStream(curPath), remotePath + curPath.substr(dirIndex + 1), curPath);
          }  
      });    
    }else{
      putFile(fs.createReadStream(curPath), remotePath + curPath.substr(dirIndex + 1), curPath);
    }
  }
}

function upload(paths) {
  var dirIndex = 0;
  if(paths instanceof Array) {
    paths.forEach((path) => {
      dirIndex = config[env].hasDirName?path.lastIndexOf('/'):path.length;
      uploadFiles(path, dirIndex);
    });
  }else {
    dirIndex = config[env].hasDirName?paths.lastIndexOf('/'):paths.length;
    uploadFiles(paths, dirIndex);
  }
}

function reupload(files) {
  files.forEach((file) => {
    putFile(file.readStream, file.desdir, file.path);
  });
}
