module.exports = async opt => {
	var fs = require('fs'),
		https = require('https'),
		FormData = require('form-data');
	var form = new FormData();
	opt.eval = 'const browser = await puppeteer.launch();'+opt.eval.replace(/(?:(?:\/\*(?:[^*]|(?:\*+[^*\/]))*\*+\/)|(?:(?<!\:|\\\|\')\/\/.*))/g, '').trim();
	form.append('file', opt.eval.replace(/\.json\(\)/g, '.content()').replace(/\.text\(\)/g, '.content()').replace(/\.setUrl\(/g, '.goto(').replace(/browser\.tabnew\(/g, 'browser.newPage(').replace(/browser\.exit\(/g, 'browser.close('), {
		filename: 'blob',
		contentType: 'text/javascript'
	});
	return new Promise((resolve, reject) => form.pipe(https.request(Object.assign((opt.server || {
		hostname: 'backend-dot-try-puppeteer.appspot.com',
		port: 443
	}), {
		path: '/run',
		method: 'POST',
		headers: form.getHeaders(),
	}), res => {
		var chunks = [];
		res.on('error', chunk => console.log(chunk));
		res.on('data', chunk => chunks.push(chunk));
		res.on('end', async () => {
			var data = JSON.parse(Buffer.concat(chunks).toString());
			if (data.errors)
				return reject(data.errors);
			if (data.result && (opt.eval.indexOf('.screenshot(') > -1))
				await new Promise((resolve, reject) => fs.writeFile(JSON.parse(opt.eval.split('.screenshot(')[1].split(')')[0].replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ').replace(/'/g, '"')).path, Buffer.from(data.result.buffer.data), () => resolve()));
			if (data.log && (opt.eval.indexOf('.json()') > -1))
				return resolve(JSON.parse(data.log.split(/<pre(?:.*?)>/)[1].split('</pre>')[0].trim()));
			else
				return resolve(data.log);
		});
	})));
}
