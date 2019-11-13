# nodejs-chrome

[![Version](https://img.shields.io/npm/v/nodejs-chrome.svg)](https://www.npmjs.org/package/nodejs-chrome)

Пример
Example
```javascript
var chrome = require('nodejs-chrome');
var browser = await chrome({
	headless: false,
	device: {
		name: 'Tablet | Nexus 10',
		userAgent: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 10 Build/MOB31T) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3765.0 Safari/537.36',
		touchPoints: 5,
		viewport: {
			width: 1280, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true
		}
	},
	proxy: '80.78.75.59:38253'
});
try {
	var page = await browser.tabnew();
	if (!(await browser.isHeadless()))
		await page.pointer();
	await page.setUrl('https://api.qwedl.com/ip.php');
	await page.tapClick('#menu->#menu a');
	await page.mouse.move(135, 173);
	await page.touchscreen.tap(173, 135);
	await page.type('input[type="text"]', 'Погода');
	var res = [await page.json()];
	await page.tapClick('input[type="text"]', {
		input: 'Погода', send: true, wait: true
	});
	res.push(await page.json());
	console.log({
		get: res[1].data.get,
		post: res[1].data.post,
		pointer: res[0].user.pointer,
		key: res[0].user.key,
		device: res[0].user.device,
		location: res[0].location,
		headless: await browser.isHeadless()
	});
} catch (e) {}
if (await browser.isHeadless())
	browser.exit();
```
Список устройств
Device list
```javascript
chrome().then(browser => browser.exit().then(() => console.log(browser.parent.module.devices)));
```
Подмена гео положения
Replacement of geo position
```javascript
var browser = await chrome();
try {
	var page = await browser.tabnew();
	await page.setGeoPosition({
		latitude: 51.507351, longitude: -0.127758, accuracy: 90
	});
	await page.setUrl('https://api.qwedl.com/ip.php');
	console.log((await page.json()).user.coords);
} catch (e) {}
browser.exit();
```
Запуск браузера через ssh
Launching a browser through ssh
```javascript
var browser = await chrome({
	ssh: 'login:password@host',
	userDataDir: './user',
	timeZone: 'Europe/Berlin'
});
try {
	var page = await browser.tabnew();
	await page.setUrl('https://api.qwedl.com/ip.php?headless&noalert');
	console.log(await page.json());
} catch (e) {}
await browser.exit();
```
Быстрый результат без запуска браузера
Fast result without launching the browser
```javascript
console.log(
	await chrome({
		eval: `
			var page = await browser.tabnew();
			await page.setUrl('https://api.qwedl.com/ip.php?headless&noalert');
			console.log(await page.json());
			await page.screenshot({path: 'screenshot.png'});
			await browser.exit();
		`
	})
);
```

## Installation
```
npm install nodejs-chrome
```
