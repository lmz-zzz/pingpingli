// 把视觉/结构同学改好的页面拷进 public/，并自动给每页加上 app.js。
// 用法：node scripts/sync-pages.js <页面文件夹>
// 只拷 .html 和 .css（以及 images/ 之类的资源文件夹），说明文档类文件会跳过。

const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('用法：node scripts/sync-pages.js <页面文件夹>');
  process.exit(1);
}
const dest = path.join(__dirname, '..', 'public');
const SKIP = /功能一览|README|\.md$|\.zip$/;


function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (SKIP.test(name)) continue;
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) { copyDir(a, b); continue; }
    if (name.endsWith('.html')) {
      let html = fs.readFileSync(a, 'utf8');
      if (!html.includes('src="app.js"')) html = html.replace('</body>', '<script src="app.js"></script>\n</body>');
      fs.writeFileSync(b, html);
    } else if (name === 'style.css') {
      fs.copyFileSync(a, b);
    } else {
      fs.copyFileSync(a, b);
    }
    console.log('✓', path.relative(from, a));
  }
}
copyDir(src, dest);
