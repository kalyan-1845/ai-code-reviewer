const fs = require('fs');
const file = 'ai-engine/app.py';
let content = fs.readFileSync(file, 'utf8');

// The block starts at `async def _call_llm(system_prompt: str, user_prompt: str) -> dict:`
// and ends after `You must obey the JSON output format above."""`
// The `try:` block that follows should be INSIDE `_call_llm`.

const regex = /async def _call_llm\(system_prompt: str, user_prompt: str\) -> dict:[\s\S]*?You must obey the JSON output format above\."""\n\n\s*try:\n\s*async with groq_semaphore:\n\s*completion = await _call_groq_with_timeout\(([\s\S]*?)\n\s*\)\n\s*response_content = completion\.choices\[0\]\.message\.content\n\s*if not response_content:\n\s*raise HTTPException\(status_code=502, detail="Groq returned an empty or filtered response\. The input may have been blocked by safety filters\."\)\n\s*try:\n\s*batch_result = await run_batch_pipeline\(/;

const replacement = `async def _call_llm(system_prompt: str, user_prompt: str) -> dict:
            try:
                async with groq_semaphore:
                    completion = await _call_groq_with_timeout(
                        model=groq_model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=temperature,
                        max_tokens=max_tokens,
                        response_format={"type": "json_object"}
                    )
                    
                    response_content = completion.choices[0].message.content
                    if not response_content:
                        raise HTTPException(status_code=502, detail="Groq returned an empty or filtered response. The input may have been blocked by safety filters.")
                    
                    import json
                    return json.loads(response_content)
            except Exception as e:
                print(f"Error calling LLM: {e}")
                return {"fileReviews": []}

        try:
            batch_result = await run_batch_pipeline(`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log("Fixed app.py");
