import json
with open('contribs.json', encoding='utf-16le') as f:
  data = json.load(f)
for c in data[:5]:
  print(f'{c[\"login\"]}: {c[\"contributions\"]}')
