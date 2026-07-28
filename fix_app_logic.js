const fs = require('fs');
const file = 'ai-engine/app.py';
let content = fs.readFileSync(file, 'utf8');

const regex = /try:\n\s*batch_result = await run_batch_pipeline\([\s\S]*?llm_caller=_call_llm\n\s*\)\n[\s\S]*?truncated_files\.extend\(local_truncated_files\)/;

const replacement = `try:
                    batch_result = await run_batch_pipeline(
                        company=company,
                        language=language,
                        structure_text=structure_text,
                        contents_text=contents_text,
                        is_first_batch=is_first_batch,
                        base_prompt=base_prompt,
                        llm_caller=_call_llm
                    )
                    
                    if is_first_batch:
                        if "mermaidDiagram" in batch_result:
                            sanitized = sanitize_ai_output(batch_result["mermaidDiagram"])
                            combined_result["mermaidDiagram"] = sanitize_mermaid_code(sanitized)
                        if "generatedReadme" in batch_result:
                            combined_result["generatedReadme"] = sanitize_ai_output(batch_result["generatedReadme"])
                    
                    if "fileReviews" in batch_result:
                        reviews = batch_result["fileReviews"]
                        if isinstance(reviews, list):
                            for entry in reviews:
                                file_path = entry.get("filePath", "unknown")
                                review = {k: entry.get(k, []) for k in ("bugs", "security", "optimization", "styling")}
                                _merge_review(combined_result, file_path, review, idx, review_config)
                        elif isinstance(reviews, dict):
                            for file_path, review in reviews.items():
                                _merge_review(combined_result, file_path, review, idx, review_config)

                    truncated_files.extend(local_truncated_files)`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log("Fixed app logic");
