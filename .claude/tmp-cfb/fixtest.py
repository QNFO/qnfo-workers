import io
p='qnfo-ai-search/ask-plain.test.mjs'
s=io.open(p,encoding='utf-8',newline='').read()
s=s.replace('var ANSWER_REV = "rd+-"/.test(src)','var ANSWER_REV = "r\d+-"/.test(src)')
s=s.replace('console.log(pass + " passed, " + fail + " failed");\nif (fail)','// 7. ASK-FIX-1: the plain-language rule says where the everyday words go (the two sentences the plain check reads)\nok(/The first two sentences are the ones a visitor reads first: state the result there in everyday words/.test(src), "the writer prompt asks for the result in everyday words in the first two sentences");\nconsole.log(pass + " passed, " + fail + " failed");\nif (fail)',1)
io.open(p,'w',encoding='utf-8',newline='').write(s)
