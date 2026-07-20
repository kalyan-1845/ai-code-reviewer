import json
with open('contribs.json', encoding='utf-16le') as f:
  data = json.load(f)
for c in data[:5]:
  login = c['login']
  contribs = c['contributions']
  print(f'{login}: {contribs}')
