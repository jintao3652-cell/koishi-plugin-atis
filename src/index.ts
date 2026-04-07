import { Context, h } from 'koishi';
import axios from 'axios';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import schedule from 'node-schedule';

export const name = 'atis-fetcher';

const CACHE_DIR = path.resolve(__dirname, 'cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

console.log(`[atis-fetcher] 缓存目录: ${CACHE_DIR}`);

// 每天 0 点清理缓存
schedule.scheduleJob('0 0 * * *', () => {
  console.log('[atis-fetcher] 开始清理缓存文件夹...');
  fs.readdir(CACHE_DIR, (err, files) => {
    if (err) {
      console.error('[atis-fetcher] 清理缓存时出错:', err);
      return;
    }
    for (const file of files) {
      fs.unlink(path.join(CACHE_DIR, file), (unlinkErr) => {
        if (unlinkErr) {
          console.error(`[atis-fetcher] 删除文件失败: ${file}`, unlinkErr);
        } else {
          console.log(`[atis-fetcher] 已删除缓存文件: ${file}`);
        }
      });
    }
  });
});

export function apply(ctx: Context) {
  ctx.command('9991 <icao:string>', '获取 ATIS 信息')
    .action(async ({ session }, icao) => {
      if (!icao) {
        return '请提供 ICAO 代码，例如：9981 ZBAA';
      }

      console.log(`[atis-fetcher] 收到请求 ICAO: ${icao}`);

      try {
        const url = `https://139.180.218.31/a/${icao}`;
        console.log(`[atis-fetcher] 请求 ATIS 信息: ${url}`);

        // 启动 Puppeteer 浏览器，并禁用 SSL 验证
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // 定位到 .text-center 部分
        const element = await page.$('.text-center');
        if (!element) {
          await browser.close();
          return '未找到 ATIS 信息';
        }

        // 截图并保存到缓存目录
        const filePath = path.join(CACHE_DIR, `${icao}_${Date.now()}.png`);
        await element.screenshot({ path: filePath });
        console.log(`[atis-fetcher] 图片已保存: ${filePath}`);

        // 发送提及用户并附上 ICAO 和 ATIS 信息（文本和图片一起发送）
        await browser.close();
        await session.send([h.at(session.userId),`\n这是${icao}的ATIS信息`, h.image(filePath), `免责声明：此信息仅供参考，不应用于实际飞行计划或导航\n数据来源：atis.report`]);

        return;  // 不返回任何附加信息
      } catch (error) {
        console.error(`[atis-fetcher] 获取 ATIS 信息失败: ${error.message}`);
        return `@${session.username} 获取 ATIS 信息失败: ${error.message}`;
      }
    });
}
