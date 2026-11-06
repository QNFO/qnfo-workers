import io,sys
p='qnfo-ai-search/worker.js'
s=io.open(p,encoding='utf-8',newline='').read()
a='"- Write in plain language for an intelligent reader who is not a specialist: short sentences (under 25 words), one idea per sentence, no long chains of clauses. '
assert s.count(a)==1
b=a+'The first two sentences are the ones a visitor reads first: state the result there in everyday words (no more than a couple of technical terms, and no long specialist word where a plain one says the same), then give the excerpts\' technical terms with their gloss from the third sentence on. '
s=s.replace(a,b)
v='var VERSION = "2.12.0"; // '
assert s.count(v)==1
s=s.replace(v,'var VERSION = "2.12.1"; // 2.12.1 ASK-FIX-1 (2026-10-28, agent_issues 1000627, pillar reach; patch): ask_plain_share_7d read 0.32 (8 of 25 answers) against a kill band of 0.5; the plain check reads the first two sentences, and the writer prompt told it to keep technical terms and gloss them but never said where, so a result sentence carried long specialist words (dense flag, plain and 4). The plain-language rule now asks for the result in everyday words in the first two sentences and the technical terms with their gloss after them; ANSWER_REV r9 so cached answers written before the change are not replayed. Prediction: ask_plain_share_7d rises above 0.5 on answers after the deploy (7-day window, so about a week). Revert: restore the previous rule text and r8. 2.12.0 earlier history follows. // ')
assert s.count('var ANSWER_REV = "r8-";')==1
s=s.replace('var ANSWER_REV = "r8-";','var ANSWER_REV = "r9-";')
io.open(p,'w',encoding='utf-8',newline='').write(s)
io.open('qnfo-ai-search/deployed-current.worker.js','w',encoding='utf-8',newline='').write(s)
