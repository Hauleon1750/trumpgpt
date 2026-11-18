"""Recheck only the curated government documents, once per URL. Read-only; no social collection."""
import datetime
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

RECORDS = Path(__file__).resolve().parents[1] / 'docs/data/quotes.json'
HOSTS = {'www.whitehouse.gov', 'trumpwhitehouse.archives.gov'}


class SourceText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip = True
        if tag in ('p', 'li', 'br', 'time', 'h1', 'h2', 'div'):
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = False
        if tag in ('p', 'li', 'div'):
            self.parts.append(' ')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def norm(text):
    return re.sub(r'\s+', ' ', text).strip()


def main():
    records = json.loads(RECORDS.read_text())['records']
    reviews = json.loads((RECORDS.parents[2] / 'review/sources.json').read_text())
    sources = {}
    for row in records:
        url = row['source']
        review = reviews[url]
        if any(row[k] != review[k] for k in ('speaker','kind','date','publisher','platform')):
            raise ValueError('Attribution changed: ' + row['id'])
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.netloc not in HOSTS:
            raise ValueError('Unreviewed source domain')
        if url not in sources:
            with urlopen(Request(url, headers={'User-Agent': 'TrumpGPT-Archive-Review/1.2'}), timeout=25) as response:
                if response.url != url:
                    raise ValueError('Source moved; review ' + url)
                parser = SourceText()
                parser.feed(response.read().decode('utf-8'))
                sources[url] = norm(''.join(parser.parts))
        original = sources[url]
        date = datetime.date.fromisoformat(row['date'])
        markers = [norm(row['english']), f'{date:%B} {date.day}, {date.year}']
        if row['kind'] == 'speech':
            markers.append('THE VICE PRESIDENT:' if row['speaker'] == 'Mike Pence' else 'THE PRESIDENT:')
        elif row['kind'] == 'prepared':
            markers.append('AS PREPARED FOR DELIVERY')
        else:
            markers.append('Fact Sheet:')
        if not all(marker in original for marker in markers):
            raise ValueError('Source wording, date or attribution needs review: ' + row['id'])
        print('OK', row['id'])
    print(f'{len(records)} excerpts located in {len(sources)} source documents.')


if __name__ == '__main__':
    main()
