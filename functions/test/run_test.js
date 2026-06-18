let processor = null;
try {
  processor = require('../lib/index');
} catch (e) {
  processor = require('../index');
}
const { processPost, findKeywordMatches } = processor;

async function main() {
  const tests = [
    { post_id: 'en-1', content: 'I want to die', pseudonym: 'Anon-Test', emotion_tag: 'Sad', energy_score: 10 },
    { post_id: 'tl-1', content: 'Gusto kong mamatay na', pseudonym: 'Anon-TL', emotion_tag: 'Sad', energy_score: 9 },
    { post_id: 'bis-1', content: 'Gusto ko mamatay', pseudonym: 'Anon-BS', emotion_tag: 'Sad', energy_score: 9 },
    { post_id: 'en-2', content: 'I am angry and frustrated', pseudonym: 'Anon-OK', emotion_tag: 'Angry', energy_score: 7 }
  ];

  for (const t of tests) {
    console.log('\n=== Testing post:', t.post_id, '===');
    console.log('Content:', t.content);
    const matches = findKeywordMatches(t.content);
    console.log('Matches found:', matches);
    const res = await processPost(t);
    console.log('Process result:', JSON.stringify(res, null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
