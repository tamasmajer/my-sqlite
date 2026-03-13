# my-sqlite Query Protocol Specification

**Version:** 1.0 draft
**Status:** Proposal
**Date:** 2026-03-13

## 1. Overview

This document specifies a unified query language for my-sqlite that works across URL query strings, request bodies, batch commands, and CLI arguments. The language is a superset of JSON: any valid JSON query remains valid, but the format additionally supports unquoted keys/values and a flat URL-native syntax that requires no percent-encoding.

The motivation is that the current format `GET /api/mydb/users?{"age":{"$gte":25},"$sort":{"age":-1}}` requires URL-encoding of `{`, `"`, and `:` characters, making curl and browser-bar usage painful. The new format allows the equivalent: `GET /api/mydb/users?age$gte=25&$sort=-age`.

## 2. Three Input Formats

A query string is parsed as one of three formats, detected by heuristic. All three produce the same canonical JSON object.

| Format | Detection Rule | Example |
|--------|---------------|---------|
| **Strict JSON** | Contains `"` AND starts with `{` | `{"age":{"$gte":25},"$sort":{"age":-1}}` |
| **Lazy JSON** | Starts with `{` and contains nested `{` but no `"` | `{age:{$gte:25},$sort:{age:-1}}` |
| **URL-native** | Everything else | `age$gte=25&$sort=-age` |

### 2.1 Detection Algorithm

```
function detectFormat(input):
  trimmed = input.trim()
  if trimmed starts with '{':
    if trimmed contains '"':
      return STRICT_JSON
    else:
      return LAZY_JSON
  else:
    return URL_NATIVE
```

## 3. Strict JSON Format

Standard JSON. Parsed with `JSON.parse()`. This is the current format — full backward compatibility.

```
{"age":{"$gte":25},"$sort":{"age":-1},"$limit":10}
```

No further specification needed; JSON is JSON.

## 4. Lazy JSON Format

JSON with relaxed quoting rules. Outer `{}` are required (this is what distinguishes it from URL-native). Inner structure follows JSON but:

- Keys need not be quoted
- String values need not be quoted (unless they contain structural characters)
- Numbers, `true`, `false`, `null` are auto-typed (see Section 8)

### 4.1 Syntax

```
{key:value, key:{$op:value}, $modifier:value}
```

Structural characters inside lazy JSON: `{` `}` `,` `:` `[` `]`

A value that does not start with `{` or `[` is a **bare word** — it extends until the next `,` `}` or end of input, with trailing whitespace trimmed. Bare words are auto-typed per Section 8.

### 4.2 Examples

| Lazy JSON | Canonical JSON |
|-----------|---------------|
| `{age:25}` | `{"age":25}` |
| `{name:alice,age:30}` | `{"name":"alice","age":30}` |
| `{age:{$gte:25},$sort:{age:-1}}` | `{"age":{"$gte":25},"$sort":{"age":-1}}` |
| `{tags:{$in:[a,b,c]}}` | `{"tags":{"$in":["a","b","c"]}}` |

### 4.3 Arrays in Lazy JSON

Both `[]` and `()` are accepted as array delimiters:

```
{tags:{$in:[admin,dev]}}
{tags:{$in:(admin,dev)}}
```

Both produce `{"tags":{"$in":["admin","dev"]}}`.

## 5. URL-Native Format

The primary new format. Flat key-value pairs separated by `&` or `,`. No outer braces.

### 5.1 Core Syntax

```
key=value & key=value
key:value , key:value
```

- `=` and `:` are interchangeable as key-value separators
- `&` and `,` are interchangeable as pair separators
- Whitespace around separators is trimmed

### 5.2 Operators on Fields

Operators are attached to field names with `$`:

```
field$op=value
```

This expands to `{"field": {"$op": value}}`.

Multiple operators on the same field merge into one object:

```
age$gte=18&age$lte=65
```

Produces `{"age": {"$gte": 18, "$lte": 65}}`.

### 5.3 Exact Match

A plain key=value with no `$` in the key is an exact match:

```
role=admin
```

Produces `{"role": "admin"}`.

### 5.4 Modifiers

Modifiers start with `$` at the top level:

```
$sort=-age
$limit=10
$skip=20
$count=true
$search=hello world
```

### 5.5 Sort Syntax

Sort in URL-native uses a compact notation instead of the JSON `{field: 1/-1}` object:

| URL-native | Canonical JSON |
|-----------|---------------|
| `$sort=age` | `{"$sort":{"age":1}}` |
| `$sort=-age` | `{"$sort":{"age":-1}}` |
| `$sort=(-age,name)` | `{"$sort":{"age":-1,"name":1}}` |
| `$sort=-age,name` | **ambiguous** — see Section 5.6 |

Multi-field sort MUST use parentheses/brackets to group:

```
$sort=(-age,name,created)
$sort=[-age,name,created]
```

Without parens, `,` is a pair separator, so `$sort=-age,name=bob` would parse `$sort=-age` and `name=bob` as two separate entries.

### 5.6 Ambiguity Resolution Rule

When `$sort` value does not start with `(` or `[`, it is a single-field sort. Everything up to the next `&` or `,` is the sort value.

**IMPORTANT:** Because `,` is a pair separator, multi-field sort MUST be wrapped in `()` or `[]`. This is the one case where parens are required, not optional.

### 5.7 Array Values

For operators that take arrays (`$in`, `$nin`), use `()` or `[]`:

```
status$in=(active,pending,review)
tags$nin=[archived,deleted]
```

Produces:
```json
{"status": {"$in": ["active", "pending", "review"]}}
{"tags": {"$nin": ["archived", "deleted"]}}
```

### 5.7.1 Object Values in URL-Native

Parentheses/brackets can also wrap **key-value pairs** to represent an object value:

```
prefs=(theme=dark lang=en)
meta=(a=1 b=2)
```

Produces:
```json
{"prefs": {"theme": "dark", "lang": "en"}}
{"meta": {"a": 1, "b": 2}}
```

If the content inside `()`/`[]` contains a top-level `=` or `:`, it is parsed as an object. Otherwise it is parsed as an array.

### 5.8 Search

Simple search (string):
```
$search=hello world
```
Produces `{"$search": "hello world"}` — the server splits on whitespace into terms and searches all FTS-indexed fields.

Structured search (with field specification):
```
$search=(name,bio):hello world
```
Produces `{"$search": {"fields": ["name", "bio"], "terms": ["hello", "world"]}}`.

**Compatibility note:** The current system requires `{"$search": {"fields": [...], "terms": [...]}}`. The simple string form `$search=hello` is a new shorthand that the server must expand by using all FTS-indexed fields for the collection. If no FTS index exists, the server should return an error.

### 5.9 Full Grammar (URL-native)

```
query       = pair ( sep pair )*
sep         = '&' | ','
pair        = key assign value
assign      = '=' | ':'
key         = field_op | modifier | field_name
field_op    = IDENT '$' OP_NAME          # e.g. age$gte
modifier    = '$' MODIFIER_NAME          # e.g. $sort
field_name  = IDENT                      # e.g. role
value       = array | bare_word
array       = ('(' | '[') value_list (')' | ']')
value_list  = bare_word ( ',' bare_word )*
bare_word   = <characters except unescaped , & = : ( ) [ ] { }>
IDENT       = [a-zA-Z_][a-zA-Z0-9_.]*
OP_NAME     = 'gt' | 'lt' | 'gte' | 'lte' | 'ne' | 'in' | 'nin' | 'like'
MODIFIER_NAME = 'sort' | 'limit' | 'skip' | 'count' | 'search'
```

## 6. Operators

All filter operators. These apply to individual fields.

| Operator | Meaning | URL-native | JSON |
|----------|---------|-----------|------|
| (none) | Equals | `name=alice` | `{"name":"alice"}` |
| `$gt` | Greater than | `age$gt=25` | `{"age":{"$gt":25}}` |
| `$lt` | Less than | `age$lt=65` | `{"age":{"$lt":65}}` |
| `$gte` | Greater or equal | `age$gte=25` | `{"age":{"$gte":25}}` |
| `$lte` | Less or equal | `age$lte=65` | `{"age":{"$lte":65}}` |
| `$ne` | Not equal | `status$ne=banned` | `{"status":{"$ne":"banned"}}` |
| `$in` | In array | `role$in=(admin,mod)` | `{"role":{"$in":["admin","mod"]}}` |
| `$nin` | Not in array | `role$nin=(banned,suspended)` | `{"role":{"$nin":["banned","suspended"]}}` |
| `$like` | Prefix match | `name$like=al` | `{"name":{"$like":"al"}}` |

## 7. Modifiers

Top-level query modifiers. These do not filter — they control result shape.

| Modifier | Type | URL-native | JSON |
|----------|------|-----------|------|
| `$sort` | string or array | `$sort=-age` | `{"$sort":{"age":-1}}` |
| `$limit` | number | `$limit=10` | `{"$limit":10}` |
| `$skip` | number | `$skip=20` | `{"$skip":20}` |
| `$count` | boolean | `$count=true` | `{"$count":true}` |
| `$search` | string | `$search=hello` | `{"$search":"hello"}` |

## 8. Value Typing Rules

Bare words (unquoted values) are auto-typed in this priority order:

| Pattern | Type | Examples |
|---------|------|---------|
| Matches `/^-?\d+$/` | integer | `25`, `-3`, `0` |
| Matches `/^-?\d+\.\d+$/` | float | `3.14`, `-0.5` |
| `true` | boolean true | |
| `false` | boolean false | |
| `null` | null | |
| Everything else | string | `alice`, `hello world`, `foo-bar` |

### 8.1 Forcing String Type

To force a value that looks like a number to be treated as a string, quote it:

```
zipcode="90210"
```

In URL-native, double quotes around a value preserve it as a string:

```
id="123"
```

Produces `{"id": "123"}` instead of `{"id": 123}`.

In URLs, `"` must be percent-encoded as `%22`:

```
?id=%2290210%22
```

This is the one case where encoding is needed, and it's rare — most string values don't look like numbers.

## 9. Escaping Rules

### 9.1 Problem Characters in Values

The characters `,` `&` `=` `:` `(` `)` `[` `]` `$` `{` `}` have structural meaning. To include them literally in values:

| Mechanism | Syntax | Example |
|-----------|--------|---------|
| Double-quote wrapping | `key="value,with,commas"` | `city="St. Louis, MO"` |
| Backslash escape | `key=value\,still` | `note=hello\,world` |
| URL percent-encoding | `key=value%2Cwith` | (in URLs only) |

### 9.2 Rules

1. **Inside double quotes:** all structural characters are literal. Only `"` and `\` need escaping (as `\"` and `\\`).
2. **Outside quotes:** backslash-escape any structural character: `\,` `\=` `\:` `\$` `\(` `\)` `\[` `\]` `\{` `\}`
3. **In URLs:** standard percent-encoding always works as an alternative.
4. **Spaces at top-level** in URL-native separate pairs. For strings with spaces, use quotes or `\ `.

### 9.3 Dollar Sign in Values

Since `$` in a key signals an operator, a field name literally containing `$` is not supported in URL-native format. Use JSON format for such edge cases. In values, `$` is just a character — no escaping needed:

```
price$gte=100    # field "price", operator $gte
note=costs $100  # value is the string "costs $100"
```

The `$` is only structural when it appears in a **key** after a field name or at the start of a modifier.

### 9.4 Empty Strings

```
name=""           # empty string value
name=             # also empty string (bare word with no content)
```

Both produce `{"name": ""}`.

### 9.5 Keys with Dots

Dot in field names is literal, not a nesting operator. The field `user.name` means a column literally named `user.name`. (SQLite columns can have dots.)

## 10. Nested Objects as Values

URL-native is intentionally flat, but supports **flat object values** via parentheses/brackets. For deeper nested JSON, use lazy or strict JSON:

```
# URL-native — cannot express this:
# prefs = {"theme": "dark", "lang": "en"}

# URL-native — flat object value:
# prefs = (theme=dark lang=en)

# Lazy JSON — works:
{prefs:{theme:dark,lang:en}}

# Strict JSON — works:
{"prefs":{"theme":"dark","lang":"en"}}
```

**Rationale:** URL-native is for querying, which operates on top-level fields. You filter on columns, not on nested JSON paths. If SQLite JSON path queries are added later, a dot-path syntax could be introduced as a future extension.

## 11. Parsing Algorithm

### 11.1 Top-Level Dispatch

```
function parseQuery(input):
  if input is empty or null:
    return {}

  input = decodeURIComponent(input)  // for URL query strings
  trimmed = input.trim()

  if trimmed starts with '{':
    if trimmed contains '"':
      return JSON.parse(trimmed)              // strict JSON
    else:
      return parseLazyJson(trimmed)           // lazy JSON
  else:
    return parseUrlNative(trimmed)            // URL-native
```

### 11.2 URL-Native Parser

```
function parseUrlNative(input):
  result = {}
  pairs = splitTopLevel(input, [',', '&'])    // split respecting parens/brackets/quotes

  for each pair in pairs:
    [key, value] = splitFirst(pair, ['=', ':'])  // split on first = or :
    key = key.trim()
    value = value.trim()

    if key starts with '$':
      // Modifier
      modName = key                            // e.g. "$sort"
      result[modName] = parseModifierValue(modName, value)

    else if key contains '$':
      // Field with operator: "age$gte"
      [field, op] = key.split('$', 2)
      op = '$' + op
      value = parseValue(value)

      if result[field] is not an object:
        result[field] = {}
      result[field][op] = value

    else:
      // Exact match
      result[key] = parseValue(value)

  return result
```

### 11.3 Value Parser

```
function parseValue(raw):
  if raw is empty:
    return ""

  // Quoted string
  if raw starts with '"' and ends with '"':
    return unescapeString(raw[1..-1])

  // Array
  if raw starts with '(' or '[':
    inner = raw[1..-1]                         // strip delimiters
    items = splitTopLevel(inner, [','])
    return items.map(parseValue)

  // Auto-type bare word
  return autotype(raw)

function autotype(s):
  if s matches /^-?\d+$/:         return parseInt(s)
  if s matches /^-?\d+\.\d+$/:    return parseFloat(s)
  if s == 'true':                  return true
  if s == 'false':                 return false
  if s == 'null':                  return null
  return s                         // string
```

### 11.4 Modifier Value Parser

```
function parseModifierValue(mod, raw):
  switch mod:
    case '$limit':  return parseInt(raw)
    case '$skip':   return parseInt(raw)
    case '$count':  return raw == 'true' or raw == '1'

    case '$sort':
      return parseSortValue(raw)

    case '$search':
      return parseSearchValue(raw)

function parseSortValue(raw):
  // Multi-field: $sort=(-age,name)
  if raw starts with '(' or '[':
    inner = raw[1..-1]
    fields = inner.split(',')
  else:
    fields = [raw]                              // single field

  sortObj = {}
  for each f in fields:
    f = f.trim()
    if f starts with '-':
      sortObj[f.slice(1)] = -1
    else:
      sortObj[f] = 1
  return sortObj

function parseSearchValue(raw):
  // Structured: $search=(name,bio):hello world
  if raw matches /^\(([^)]+)\):(.+)$/ or /^\[([^\]]+)\]:(.+)$/:
    fields = match[1].split(',').map(trim)
    terms = match[2].trim().split(/\s+/)
    return { fields, terms }

  // Simple: $search=hello world
  return raw                                    // server expands to {fields, terms}
```

### 11.5 Lazy JSON Parser

```
function parseLazyJson(input):
  // Tokenize: same as JSON tokenizer but bare words are allowed
  // where JSON expects a quoted string.
  //
  // Tokens: { } [ ] ( ) : , and BARE_WORD
  // BARE_WORD = sequence of chars not in { } [ ] ( ) : ,
  //
  // ( is treated as [, ) is treated as ]
  // Parse as JSON structure but:
  //   - object keys can be bare words
  //   - values can be bare words (auto-typed)

  tokens = tokenize(input)  // replaces ( with [ and ) with ]
  return parseObject(tokens)
```

### 11.6 Top-Level Split (respecting nesting)

```
function splitTopLevel(input, delimiters):
  // Split on delimiter characters, but NOT inside:
  //   - parentheses ()
  //   - brackets []
  //   - braces {}
  //   - double quotes ""

  result = []
  current = ""
  depth = 0
  inQuote = false

  for each char c in input:
    if inQuote:
      current += c
      if c == '"' and previous != '\\':
        inQuote = false
      continue

    if c == '"':
      inQuote = true
      current += c
      continue

    if c in '([{':
      depth++
      current += c
      continue

    if c in ')]}':
      depth--
      current += c
      continue

    if depth == 0 and c in delimiters:
      result.push(current.trim())
      current = ""
      continue

    current += c

  if current.trim():
    result.push(current.trim())

  return result
```

## 12. Canonical JSON Form

Every query, regardless of input format, is converted to the same canonical JSON object before being passed to `buildFilter()`. The canonical form is exactly what the current system uses:

```json
{
  "field1": "value",
  "field2": {"$gte": 25, "$lte": 65},
  "$sort": {"age": -1, "name": 1},
  "$limit": 10,
  "$skip": 0,
  "$count": true,
  "$search": {"fields": ["name", "bio"], "terms": ["hello", "world"]}
}
```

The parsing layer (`parseQuery`) replaces the current `JSON.parse(decodeURIComponent(filterStr))` call in `parseFilter()`. Everything downstream of `buildFilter()` is unchanged.

## 13. URL Query String Usage

In a GET or DELETE request, the query follows `?`:

```
GET /api/mydb/users?age$gte=25&$sort=-age&$limit=10
GET /api/mydb/users?{age:{$gte:25},$sort:{age:-1}}
GET /api/mydb/users?{"age":{"$gte":25}}
```

The server reads `url.search.slice(1)` and passes it to `parseQuery()`.

**URL encoding:** In URL-native format, only `"` needs encoding (`%22`) and only when forcing string types. All other structural characters (`$`, `(`, `)`, `,`, `=`) are URL-safe or traditionally unencoded. `&` is the standard query string separator. `[` and `]` should be percent-encoded in URLs (use `()` instead).

**Recommendation for URLs:** Use `()` for arrays and `&` for separators. This requires zero percent-encoding:

```
GET /api/mydb/users?role$in=(admin,mod)&$sort=(-age,name)&$limit=10
```

## 14. Request Body Usage

For POST requests that carry query filters in the body (future use), the same format applies. Content-Type header guides parsing:

| Content-Type | Behavior |
|-------------|----------|
| `application/json` | Strict JSON parse |
| `text/plain` or omitted | Run through `parseQuery()` (auto-detect) |
| `application/x-www-form-urlencoded` | URL-native parse |

For PUT/PATCH (which carry document bodies, not queries), the body is always JSON — the query format does not apply to document bodies.

## 15. Batch Protocol

### 15.1 Format

A batch request is sent as `POST /api/:db` with `Content-Type: text/plain`. The body contains one command per line:

```
METHOD /collection query-or-body
```

Where:
- **METHOD** is one of `GET`, `PUT`, `PATCH`, `DELETE`
- **/collection** is the collection path (leading `/` required)
- **query-or-body** is the rest of the line, parsed depending on method

### 15.2 Method Semantics

| Method | Rest of line | Behavior |
|--------|-------------|----------|
| `GET` | query (URL-native, lazy JSON, or strict JSON) | Query documents |
| `PUT` | document body (JSON or lazy JSON) | Upsert document(s) |
| `PATCH` | document body (JSON or lazy JSON) | Partial update |
| `DELETE` | query filter | Delete matching documents |

### 15.3 Example

```
PUT /users {id:u1, name:alice, age:30}
PUT /users {id:u2, name:bob, age:22}
PUT /orders {id:o1, userId:u1, total:50}
GET /users age$gte=25, $sort=-age
PATCH /users {id:u1, age:31}
DELETE /users id=u2
GET /users $count=true
```

### 15.4 Response

The response is a JSON array, one result per line, in order:

```json
[
  {"ok": 1},
  {"ok": 1},
  {"ok": 1},
  [{"id": "u1", "name": "alice", "age": 30}],
  {"ok": 1},
  {"ok": 1},
  {"count": 1}
]
```

### 15.5 Error Handling

Each line is executed independently within a single transaction. If any line fails:

**Option A — Atomic (recommended):** The entire batch is rolled back. Response includes the error and the line number:

```json
{"ok": 0, "error": "Unknown operator: $foo", "line": 4}
```

**Option B — Best-effort:** Each line gets a result. Failed lines get error objects, successful lines get their normal results. The transaction still wraps everything, so either all succeed or all fail. (This is Option A with more detail in the response.)

**Recommended:** Option A. A batch is a transaction. Any failure rolls back everything. The response is either the full results array or a single error object.

### 15.6 Parsing Algorithm for Batch

```
function parseBatchLine(line):
  line = line.trim()
  if line is empty or starts with '#':
    return null                              // skip blank lines and comments

  match = line.match(/^(GET|PUT|PATCH|DELETE)\s+\/(\S+)\s*(.*)$/i)
  if not match:
    throw "Invalid batch line"

  method = match[1].toUpperCase()
  collection = match[2]
  rest = match[3].trim()

  if method == 'GET' or method == 'DELETE':
    filter = parseQuery(rest)                // URL-native, lazy JSON, or strict JSON
    return { method, collection, filter }

  if method == 'PUT' or method == 'PATCH':
    body = parseLazyOrStrict(rest)           // must be object/array, not URL-native
    return { method, collection, body }
```

**Note:** For PUT/PATCH in batch, URL-native is NOT used because the payload is a document, not a query. The parser detects lazy vs strict JSON via the `"` heuristic. If the rest of the line doesn't start with `{` or `[`, it is an error.

### 15.7 Comments and Blank Lines

Lines starting with `#` are comments. Blank lines are ignored. This makes batch files human-editable:

```
# Setup test data
PUT /users {id:u1, name:alice}
PUT /users {id:u2, name:bob}

# Query
GET /users $sort=-name
```

## 16. Search Interaction with Filters

Search and filters compose with AND semantics:

```
$search=alice&age$gte=25
```

Canonical: `{"$search": "alice", "age": {"$gte": 25}}`

The server performs FTS match AND the SQL WHERE clause. This already works in the current implementation — `execFts` appends `AND ${where}` when additional conditions exist.

### 16.1 Simple vs Structured Search

| Format | Produces | Server behavior |
|--------|---------|-----------------|
| `$search=alice` | `{"$search": "alice"}` | Server splits into terms, uses all FTS-indexed fields |
| `$search=(name,bio):alice bob` | `{"$search": {"fields":["name","bio"], "terms":["alice","bob"]}}` | Uses specified fields, creates FTS index if needed |

When `$search` is a plain string, the server must:
1. Look up existing FTS indexes for the collection (via `getFtsIndexes`)
2. If exactly one exists, use its fields
3. If none exist, return 400 error: "No FTS index. Use OPTIONS to view schema."
4. If multiple exist, use the first one (or return error — TBD)

## 17. Count with Filters

```
age$gte=25&$count=true
```

Returns `{"count": N}` — only documents matching the filter are counted. Sort/skip/limit are ignored when `$count=true`.

## 18. Comparison Table

Query: "Users aged 25+, sorted by age descending, limit 10"

| Format | Query String |
|--------|-------------|
| Strict JSON | `?{"age":{"$gte":25},"$sort":{"age":-1},"$limit":10}` |
| Strict JSON (URL-encoded) | `?%7B%22age%22%3A%7B%22%24gte%22%3A25%7D%2C%22%24sort%22%3A%7B%22age%22%3A-1%7D%2C%22%24limit%22%3A10%7D` |
| Lazy JSON | `?{age:{$gte:25},$sort:{age:-1},$limit:10}` |
| URL-native | `?age$gte=25&$sort=-age&$limit=10` |

Query: "Users with role admin or mod, name starting with 'al'"

| Format | Query String |
|--------|-------------|
| Strict JSON | `?{"role":{"$in":["admin","mod"]},"name":{"$like":"al"}}` |
| Lazy JSON | `?{role:{$in:(admin,mod)},name:{$like:al}}` |
| URL-native | `?role$in=(admin,mod)&name$like=al` |

Query: "Count active users"

| Format | Query String |
|--------|-------------|
| Strict JSON | `?{"status":"active","$count":true}` |
| Lazy JSON | `?{status:active,$count:true}` |
| URL-native | `?status=active&$count=true` |

Query: "Search for 'alice' in name field, age > 20, sort by name"

| Format | Query String |
|--------|-------------|
| Strict JSON | `?{"$search":{"fields":["name"],"terms":["alice"]},"age":{"$gt":20},"$sort":{"name":1}}` |
| Lazy JSON | `?{$search:{fields:[name],terms:[alice]},age:{$gt:20},$sort:{name:1}}` |
| URL-native | `?$search=(name):alice&age$gt=20&$sort=name` |

## 19. Edge Cases and Ambiguities

### 19.1 Field name looks like a modifier

If someone has a column literally named `$sort` — this is not supported. Column names starting with `$` are reserved. The server should reject them at table creation time.

### 19.2 Field name contains `$`

`my$field=value` would parse as field `my`, operator `$field`. If you have a column named `my$field`, use JSON format. In practice, SQLite column names rarely contain `$`.

### 19.3 Value looks like a number but should be string

Use quotes: `zipcode="90210"` or use JSON format.

### 19.4 Value contains commas

Use quotes: `city="Portland, OR"` or backslash: `city=Portland\, OR`.

### 19.5 Value contains equals sign

Use quotes: `equation="x=5"` or backslash: `equation=x\=5`.

### 19.6 Empty query

`GET /api/mydb/users` (no `?`) or `GET /api/mydb/users?` — returns all documents (no filter). Same as `{}`.

### 19.7 Empty filter object

`GET /api/mydb/users?{}` — returns all documents. Same as no filter.

### 19.8 Multiple operators on same field

```
age$gte=18&age$lte=65
```

Merges into `{"age": {"$gte": 18, "$lte": 65}}`. If the same operator appears twice, last wins:

```
age$gte=18&age$gte=25
```

Produces `{"age": {"$gte": 25}}`.

### 19.9 Duplicate exact-match keys

```
name=alice&name=bob
```

Last wins: `{"name": "bob"}`. (This matches JavaScript object behavior.)

### 19.10 Mixed separators

```
age$gte=25,status:active&$sort=-age
```

All valid. `,` `&` and `=` `:` are freely interchangeable.

### 19.11 `$like` with special characters

```
name$like="al$"
```

The value `al$` is passed to SQL as `al$%` (server appends `%`). The `$` in the value is not structural.

### 19.12 Boolean/null in arrays

```
active$in=(true,false)
```

Produces `{"active": {"$in": [true, false]}}` — values inside arrays are auto-typed.

### 19.13 Nested JSON values in URL-native

Not supported. URL-native is flat. For queries involving JSON-typed columns (arrays, objects), use lazy or strict JSON. This is acceptable because SQLite queries on nested JSON require JSON path functions, which this system doesn't yet support.

### 19.14 $search with no value

```
$search=
```

Empty search — should be treated as no search (ignored).

### 19.15 Batch: document with commas in values

In batch mode, the entire rest-of-line after collection is the payload. No line-level escaping. Commas inside JSON strings are fine because the parser uses JSON/lazy-JSON rules:

```
PUT /users {id:u1, name:"Smith, Jr."}
```

### 19.16 Batch: multi-line documents

Not supported. Each batch command is exactly one line. For large documents, use the regular PUT endpoint instead of batch.

### 19.17 Mismatched parens/brackets

`(a,b]` — accepted. Both `()` and `[]` are interchangeable array delimiters. The parser treats all of `(`, `[` as "open array" and `)`, `]` as "close array". Only nesting depth is tracked, not delimiter matching.

## 20. Client Library Impact

The client currently does:
```js
const qs = '?' + encodeURIComponent(JSON.stringify(filter))
```

This continues to work — strict JSON is format #1 and is always valid. No client changes required for backward compatibility.

A future enhancement could add a `toUrlNative(filter)` helper that serializes a filter object to URL-native format for debugging/logging:

```js
// Possible future addition:
Db.toUrlNative({age: {$gte: 25}, $sort: {age: -1}})
// → "age$gte=25&$sort=-age"
```

This is optional and orthogonal to the server-side parsing.

## 21. Implementation Sequence

1. **New module: `packages/server/src/parse.js`** — implements `parseQuery()` with format detection, URL-native parser, lazy JSON parser. Returns canonical filter object.

2. **Modify `query.js`** — replace `JSON.parse(decodeURIComponent(filterStr))` in `parseFilter()` with a call to `Parse.parseQuery(filterStr)`. Same for `isCount()`.

3. **Modify `router.js`** — add batch text protocol handler for `POST /api/:db` when Content-Type is `text/plain`.

4. **Modify `data.js`** — `remove()` calls `Query.parseFilter()` which will now accept all three formats. No changes needed.

5. **Tests** — comprehensive test suite for `parseQuery()` covering all examples in this spec.

6. **Client** — no changes required. Optionally add `toUrlNative()` serializer later.
