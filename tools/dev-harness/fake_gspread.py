"""DEV ONLY: in-memory stand-in for the parts of gspread the backend uses.

Lets the real FastAPI backend run locally without Google credentials and without touching
the production spreadsheet. Behaviour copied from gspread where it matters:
  * get_all_records() turns numeric-looking cells into int/float unless numericise_ignore=['all']
  * append_row/append_rows/update(range_name=...) write strings as given (RAW)
"""
import re, sys, threading, types

_lock = threading.RLock()


class WorksheetNotFound(Exception):
    pass


def _col(letters):
    n = 0
    for ch in letters: n = n * 26 + (ord(ch.upper()) - 64)
    return n


def a1_to_rowcol(a1):
    m = re.fullmatch(r'([A-Za-z]+)(\d+)', a1)
    return int(m.group(2)), _col(m.group(1))


def rowcol_to_a1(row, col):
    s = ''
    while col: col, r = divmod(col - 1, 26); s = chr(65 + r) + s
    return f'{s}{row}'


def _numericise(v):
    if not isinstance(v, str): return v
    s = v.strip()
    if re.fullmatch(r'-?\d+', s): return int(s)
    if re.fullmatch(r'-?\d+\.\d*|-?\d*\.\d+|-?\d+(\.\d+)?[eE][+-]?\d+', s):
        try: return float(s)
        except ValueError: return v
    return v


class Worksheet:
    def __init__(self, title, rows=None, cols=26):
        self.title = title
        self.rows = [list(map(str, r)) for r in (rows or [])]
        self.col_count = cols

    # reads
    def get_all_values(self):
        with _lock:
            width = max((len(r) for r in self.rows), default=0)
            out = [r + [''] * (width - len(r)) for r in self.rows]
            while out and not any(c.strip() for c in out[-1]): out.pop()
            return [list(r) for r in out]

    def row_values(self, n):
        with _lock:
            return list(self.rows[n - 1]) if 0 < n <= len(self.rows) else []

    def get_all_records(self, numericise_ignore=None, **_):
        values = self.get_all_values()
        if not values: return []
        head = values[0]
        ignore_all = numericise_ignore and 'all' in numericise_ignore
        out = []
        for row in values[1:]:
            rec = {}
            for i, h in enumerate(head):
                v = row[i] if i < len(row) else ''
                rec[h] = v if ignore_all else _numericise(v)
            out.append(rec)
        return out

    # writes
    def _put(self, r, c, v):
        while len(self.rows) < r: self.rows.append([])
        row = self.rows[r - 1]
        while len(row) < c: row.append('')
        row[c - 1] = '' if v is None else str(v)

    def update(self, range_name='A1', values=None, value_input_option='RAW', **_):
        with _lock:
            r0, c0 = a1_to_rowcol(range_name.split(':')[0])
            for i, row in enumerate(values or []):
                for j, v in enumerate(row): self._put(r0 + i, c0 + j, v)
            return {'updatedRange': range_name}

    def append_row(self, row, value_input_option='RAW', **_):
        with _lock:
            n = len(self.get_all_values()) + 1
            for j, v in enumerate(row): self._put(n, j + 1, v)

    def append_rows(self, rows, value_input_option='RAW', **_):
        for r in rows: self.append_row(r)

    def batch_clear(self, ranges):
        with _lock:
            for rg in ranges:
                a, b = rg.split(':')
                r1, c1 = a1_to_rowcol(a); r2, c2 = a1_to_rowcol(b)
                for r in range(r1, min(r2, len(self.rows)) + 1):
                    for c in range(c1, c2 + 1):
                        if c <= len(self.rows[r - 1]): self.rows[r - 1][c - 1] = ''

    def add_cols(self, n): self.col_count += n


class Spreadsheet:
    def __init__(self): self.sheets = {}

    def worksheet(self, title):
        with _lock:
            if title not in self.sheets: raise WorksheetNotFound(title)
            return self.sheets[title]

    def add_worksheet(self, title, rows=1000, cols=26):
        with _lock:
            ws = self.sheets.setdefault(title, Worksheet(title, cols=cols))
            return ws


BOOK = Spreadsheet()


class _Client:
    def open_by_key(self, key): return BOOK


def service_account_from_dict(info, **_): return _Client()


def install():
    """Register this module as `gspread` (and `gspread.utils`) before the backend is imported."""
    mod = sys.modules[__name__]
    utils = types.ModuleType('gspread.utils')
    utils.rowcol_to_a1 = rowcol_to_a1
    utils.a1_to_rowcol = a1_to_rowcol
    mod.utils = utils
    sys.modules['gspread'] = mod
    sys.modules['gspread.utils'] = utils
    return BOOK
