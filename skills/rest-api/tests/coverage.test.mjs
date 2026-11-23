import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './helpers.mjs';

// Every rule number of the guidelines (zalando/restful-api-guidelines, commit 19a1905, September 2026).
const RULES = '100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 115 116 118 120 122 123 124 127 129 130 132 133 134 135 136 137 138 139 140 141 142 143 144 145 146 147 148 149 150 151 152 153 154 155 156 157 158 159 160 161 162 163 164 165 166 167 168 169 170 171 172 173 174 176 177 178 179 180 181 182 183 184 185 186 187 188 189 190 191 192 193 194 195 196 197 198 199 200 201 202 203 204 205 207 208 209 210 211 212 213 214 215 216 217 218 219 220 223 224 225 226 227 228 229 230 231 233 234 235 236 237 238 239 240 241 242 243 244 245 246 247 248 249 250 251 252 253 254 255 256 257'.split(' ');

const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const header = (f) => read(f).split('\nimport ')[0];

test('every guideline rule is checked by a tool or listed for review', () => {
  const checked = new Set();
  for (const f of ['ruleset/rest-api.yaml', 'ruleset/zalando-internal.yaml', 'ruleset/event-types.yaml']) {
    for (const m of read(f).matchAll(/zalando-(\d+)-/g)) checked.add(m[1]);
    for (const m of read(f).matchAll(/#(\d{3})\)/g)) checked.add(m[1]);
  }
  for (const f of ['scripts/diff.mjs', 'scripts/probe.mjs']) for (const m of header(f).matchAll(/#(\d{3})/g)) checked.add(m[1]);
  const reviewed = new Set([...read('references/review.md').matchAll(/#(\d{3})/g)].map((m) => m[1]));
  assert.deepEqual(RULES.filter((r) => !checked.has(r) && !reviewed.has(r)), []);
  assert.equal(RULES.length, 146);
});
