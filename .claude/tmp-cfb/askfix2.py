import io
for p in ['qnfo-ai-search/worker.js','qnfo-ai-search/deployed-current.worker.js']:
    s=io.open(p,encoding='utf-8',newline='').read()
    a="state the result there in everyday words (no more than a couple of technical terms, and no long specialist word where a plain one says the same), then give the excerpts' technical terms with their gloss from the third sentence on. "
    assert s.count(a)==1
    s=s.replace(a,"state the result there with as few long specialist words as the excerpts allow (a couple of technical terms at most, each long word replaced by a shorter one only where an excerpt uses it or says the same), then give the excerpts' technical terms with their gloss from the third sentence on. ")
    s=s.replace("asks for the result in everyday words in the first two sentences and the technical terms with their gloss after them","asks for the result with few long specialist words in the first two sentences and the technical terms with their gloss after them")
    io.open(p,'w',encoding='utf-8',newline='').write(s)
p='qnfo-ai-search/ask-plain.test.mjs'
s=io.open(p,encoding='utf-8',newline='').read()
s=s.replace("state the result there in everyday words/.test(src), \"the writer prompt asks for the result in everyday words in the first two sentences\"","state the result there with as few long specialist words as the excerpts allow/.test(src), \"the writer prompt asks for the result with few long specialist words in the first two sentences\"")
io.open(p,'w',encoding='utf-8',newline='').write(s)
