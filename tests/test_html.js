const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        console.log('Fetching https://vidnest.fun/tv/260463/1/1 ...');
        const res = await axios.get('https://vidnest.fun/tv/260463/1/1', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Referer': 'https://vidnest.fun/'
            }
        });

        console.log(`Status: ${res.status}`);
        const $ = cheerio.load(res.data);
        
        console.log('\n--- Script Tags ---');
        $('script').each((i, el) => {
            const src = $(el).attr('src');
            const text = $(el).text();
            if (src) {
                console.log(`Script src: ${src}`);
            } else if (text && text.trim().length > 0) {
                console.log(`Inline script length: ${text.trim().length}`);
                if (text.includes('new.vidnest.fun') || text.includes('fetch') || text.includes('player') || text.includes('api')) {
                    console.log('--- Matching script snippet ---');
                    console.log(text.trim().substring(0, 1000));
                }
            }
        });

        console.log('\n--- Iframes ---');
        $('iframe').each((i, el) => {
            console.log(`Iframe src: ${$(el).attr('src')}`);
        });

        console.log('\n--- Links / Buttons ---');
        $('a, button').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            if (text || href) {
                console.log(`Tag: ${el.name}, Text: "${text}", Href/Id: ${href || $(el).attr('id') || 'none'}`);
            }
        });

    } catch (e) {
        console.error('Error fetching page:', e.message);
        if (e.response) {
            console.error('Response Status:', e.response.status);
            console.error('Response Body:', e.response.data);
        }
    }
}

test();
