const https = require('https');

function makeRequest(url, headers = {}) {
    return new Promise((resolve) => {
        try {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    ...headers
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
                });
            });

            req.on('error', (err) => {
                resolve({
                    statusCode: 0,
                    headers: {},
                    body: err.message
                });
            });

            req.end();
        } catch (e) {
            resolve({
                statusCode: 0,
                headers: {},
                body: e.message
            });
        }
    });
}

async function runTest() {
    const url = 'https://sub.vdrk.site/v2/tv/260463/1/1';
    console.log(`Fetching subtitles: ${url}`);
    
    const res = await makeRequest(url);
    console.log(`Status: ${res.statusCode}`);
    if (res.statusCode === 200) {
        try {
            const data = JSON.parse(res.body);
            console.log('Subtitles JSON:', JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('Parse error:', err.message);
            console.log('Body snippet:', res.body.substring(0, 500));
        }
    } else {
        console.log('Body:', res.body);
    }
}

runTest();
