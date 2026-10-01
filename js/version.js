// アプリのバージョン(唯一の正)。リリースのたびに 1 つ上げ、次の箇所を同じ値にそろえる:
// - js/**/*.js 内のすべての相対 import 指定子 "./x.js?v=N" / "../x.js?v=N"
// - index.html の style.css?v=N / js/app.js?v=N
// - sw.js の const VERSION = "N" と ASSETS
// tests/version.test.mjs がこの規則を検査する。
export const APP_VERSION = "14";
