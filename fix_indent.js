const fs = require('fs');
const file = 'ai-engine/app.py';
let content = fs.readFileSync(file, 'utf8');

const regex = /try:\n\s*batch_result = await run_batch_pipeline\([\s\S]*?llm_caller=_call_llm\n\s*\)/;
const replacement = `try:
                    batch_result = await run_batch_pipeline(
                        company=company,
                        language=language,
                        structure_text=structure_text,
                        contents_text=contents_text,
                        is_first_batch=is_first_batch,
                        base_prompt=base_prompt,
                        llm_caller=_call_llm
                    )`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log("Fixed indent");
