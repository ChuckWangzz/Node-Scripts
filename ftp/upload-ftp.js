var fs = require('fs');
var Client = require('ftp');
var readline = require('readline');
var config = require('./ftp.config.js');

//获取命令行参数
var env = process.argv[2];

if(!config[env]) {
  console.log('\u001b[31mERR! \u001b[39m' + 'the ' + env + " config not in ./config/ftp.config.js");
  process.exit(0);
}

//本地目录&远程目录
var localPath = config[env]['localPath'];
var remotePath = config[env]['remotePath'];

//失败的文件
var failedFiles = [];

console.log('env: ' + env);

var c = new Client();
c.on('ready', () => {
  if(failedFiles.length > 0) {
    var tempArr = failedFiles;
    failedFiles = [];
    reupload(tempArr);
  }else{
    upload(localPath);
  }
  c.end();
});

c.on('close', () => {
  if(failedFiles.length > 0) { 
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    //上传失败文件提示重传
    rl.question('\u001b[31mERR! \u001b[39m' + failedFiles.length +' files upload failed, would you like to try again(y/n) ? ', (answer) => {
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

function putFile(curPath, desdir) {
  var readStream = fs.createReadStream(curPath);
  c.put(readStream, desdir, (err) => {
    if(err) {
      console.log('\u001b[31mfail \u001b[39m    ' + curPath);
      failedFiles.push({
        path: curPath,
        desdir: desdir
      });
      console.log('\u001b[31mERR! \u001b[39m' + err);
    }else{
      console.log('\x1B[32msuccess \u001b[39m    ' + curPath);
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
              putFile(curPath, remotePath + curPath.substr(dirIndex + 1));
          }  
      });    
    }else{
      putFile(curPath, remotePath + curPath.substr(dirIndex + 1));
    }
  }else {
    console.log('\u001b[31mERR! \u001b[39m' + 'the file ' + path + ' is not exists');
    process.exit(0);
  }
}

function upload(arrPath) {
  var arr = arrPath;
  var dirIndex = 0;
  if(!Array.isArray(arr)) {
    arr = [arr];
  }
  arr.forEach((path) => {
    if(path[path.length-1] == '/') {
      path = path.substr(0, path.length - 1);
    }
    if(path[path.length-1] == '*') {
      path = path.substr(0, path.lastIndexOf('/'));
      dirIndex = path.length;
    }else{
      dirIndex = path.lastIndexOf('/');
    }
    uploadFiles(path, dirIndex);
  });
}

function reupload(files) {
  files.forEach((file) => {
    putFile(file.path, file.desdir);
  });
}
