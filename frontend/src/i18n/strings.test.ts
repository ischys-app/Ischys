import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { strings } from './strings/en.ts';
import zh from './strings/zh-Hans.json' with { type: 'json' };

const PLACEHOLDER = /\{(\w+)\}/g;
const ph = (s: string) => [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();

test('every en entry has a non-empty en and note', () => {
  for (const [k, v] of Object.entries(strings)) {
    assert.ok(v.en.trim().length > 0, `${k}: empty en`);
    assert.ok(v.note.trim().length > 0, `${k}: empty note`);
  }
});

test('every zh key exists in en', () => {
  for (const k of Object.keys(zh as Record<string, string>)) {
    assert.ok(k in strings, `zh key not in en: ${k}`);
  }
});

test('zh placeholders match en placeholders', () => {
  for (const [k, z] of Object.entries(zh as Record<string, string>)) {
    if (!(k in strings)) continue;
    assert.deepEqual(ph(z), ph(strings[k].en), `${k}: placeholder mismatch`);
  }
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test('every literal t() key used in source exists in en', () => {
  const files = [...walk('app'), ...walk('src')];
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?<![\w.])t\(\s*'([\w.]+)'/g)) {
      const k = m[1];
      if (!(k in strings) && !(`${k}_one` in strings) && !(`${k}_other` in strings)) {
        missing.push(`${f}: ${k}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('plural names a placeholder present in that entry', () => {
  for (const [k, v] of Object.entries(strings)) {
    if (v.plural === undefined) continue;
    assert.ok(ph(v.en).includes(v.plural), `${k}: plural "${v.plural}" is not a placeholder of its en text`);
  }
});

test('no key has both a _one/_other pair and plural', () => {
  for (const [k, v] of Object.entries(strings)) {
    if (v.plural === undefined) continue;
    assert.ok(!(`${k}_one` in strings) && !(`${k}_other` in strings), `${k}: has a pair and plural`);
    assert.ok(!/_(one|other)$/.test(k), `${k}: pair member carries plural`);
  }
});

test('known single-form count keys declare their count variable', () => {
  const expected: Record<string, string> = {
    'streak.days': 'days',
    'pr.pill': 'count',
    'home.exerciseCount': 'count',
    'history.deleteMessage': 'count',
    'history.sessions': 'count',
    'history.count': 'count',
    'profile.notTrained': 'count',
    'effort.nReps': 'n',
    'workoutEdit.ssAfterSave': 'count',
    'editDiscard.many': 'count',
    'common.setsCount': 'count',
    'summary.rampBody': 'days',
    'summary.easeOff': 'days',
    'summary.hold': 'days',
    'summary.deloadAccepted': 'days',
    'routineDiff.setsChanged': 'to',
    'effort.range': 'to',
    'mergeDup.memberMeta': 'sets',
    'mergeDup.receiptSub': 'sets',
    'mergeDup.mergeCount': 'count',
    'mergeDup.scopeAll': 'total',
    'mergeDup.remaining': 'n',
    'switcher.searchPlaceholder': 'n',
    'routineEdit.exercisesCount': 'n',
    'newExercise.selected': 'n',
    'library.merge': 'n',
    'settings.profilesOnPhone': 'count',
    'import.skipCardio': 'count',
    'import.skipNoName': 'count',
    'import.rowsSkipped': 'count',
    'import.seenOnce': 'count',
  };
  for (const [k, v] of Object.entries(expected)) assert.equal(strings[k]?.plural, v, k);
});

/** Single-form entries with a placeholder that are deliberately not tagged `plural`, with the reason. */
const NOT_A_COUNT: Record<string, string> = {
  "ago.minutes": "abbreviated unit (m), no noun to agree",
  "ago.hours": "abbreviated unit (h), no noun to agree",
  "ago.days": "abbreviated unit (d), no noun to agree",
  "tabs.profileWho": "name, label or text value, not a count",
  "routineCard.view": "name, label or text value, not a count",
  "routineCard.more": "name, label or text value, not a count",
  "routineMenu.deleteMessage": "name, label or text value, not a count",
  "profile.trainingSince": "date, time, rating or measured value, not a counted noun",
  "profile.trainingSinceOnly": "date, time, rating or measured value, not a counted noun",
  "profile.barsLabel": "date, time, rating or measured value, not a counted noun",
  "profile.barsAvg": "date, time, rating or measured value, not a counted noun",
  "profile.switchCurrent": "name, label or text value, not a count",
  "profile.healthOffLabel": "name, label or text value, not a count",
  "profile.healthOnLabel": "name, label or text value, not a count",
  "workout.supersetNone": "name, label or text value, not a count",
  "workout.supersetHeader": "not a counted noun",
  "effort.last": "date, time, rating or measured value, not a counted noun",
  "effort.saved": "date, time, rating or measured value, not a counted noun",
  "effort.askRir": "name, label or text value, not a count",
  "effort.askRpe": "name, label or text value, not a count",
  "effort.meaning": "name, label or text value, not a count",
  "effort.tank.range": "{from}/{to} are spelled-out words; Russian uses an abbreviation",
  "effort.tank.many": "n is a spelled-out word string, not a number",
  "effort.sentence": "not a counted noun",
  "effort.sheetTitle": "name, label or text value, not a count",
  "workout.exerciseMeta": "abbreviated seconds (s), no noun to agree",
  "workoutEdit.ssHeader": "name, label or text value, not a count",
  "workoutEdit.was.value": "date, time, rating or measured value, not a counted noun",
  "workoutEdit.note.from": "date, time, rating or measured value, not a counted noun",
  "workoutEdit.line.newRecord": "date, time, rating or measured value, not a counted noun",
  "workoutEdit.line.wasRecordNone": "date, time, rating or measured value, not a counted noun",
  "workoutEdit.line.fallsBack": "date, time, rating or measured value, not a counted noun",
  "workoutEdit.line.fallsBackOn": "date, time, rating or measured value, not a counted noun",
  "editWhen.ends": "date, time, rating or measured value, not a counted noun",
  "editWhen.endsWas": "date, time, rating or measured value, not a counted noun",
  "editDiscard.body": "name, label or text value, not a count",
  "removedRow.undoLabel": "name, label or text value, not a count",
  "routineReorder.handleLabel": "name, label or text value, not a count",
  "supersetSheet.pairs": "name, label or text value, not a count",
  "warmup.sub": "date, time, rating or measured value, not a counted noun",
  "warmup.colWeightReps": "weight or unit value, not a count",
  "workoutHeader.startedBy": "date, time, rating or measured value, not a counted noun",
  "plateSheet.bar": "weight or unit value, not a count",
  "plateSheet.barAlone": "weight or unit value, not a count",
  "plateSheet.cantLoad": "weight or unit value, not a count",
  "plateSheet.steps": "weights with unit, not a counted noun",
  "plateSheet.selected": "name, label or text value, not a count",
  "plateSheet.use": "weight or unit value, not a count",
  "setRow.name": "name, label or text value, not a count",
  "setRow.weightField": "not a counted noun",
  "setRow.repsField": "name, label or text value, not a count",
  "setRow.markNotDone": "name, label or text value, not a count",
  "setRow.complete": "name, label or text value, not a count",
  "setRow.deleteLabel": "name, label or text value, not a count",
  "setRow.typeLabel": "name, label or text value, not a count",
  "setRow.wasLabel": "not a counted noun",
  "setRow.effort": "date, time, rating or measured value, not a counted noun",
  "setRow.suggested": "date, time, rating or measured value, not a counted noun",
  "setRow.removeLabel": "name, label or text value, not a count",
  "exerciseCard.about": "name, label or text value, not a count",
  "exerciseCard.more": "name, label or text value, not a count",
  "exerciseCard.notesLabel": "name, label or text value, not a count",
  "summary.bestSet": "date, time, rating or measured value, not a counted noun",
  "summary.exercises": "label then number; noun precedes the count, no agreement",
  "summary.stalledBody": "percent, not a counted noun",
  "summary.receiptUpdated": "name, label or text value, not a count",
  "summary.receiptAdded": "name, label or text value, not a count",
  "routineDiff.typeChange": "n is an ordinal set position",
  "routineDiff.typeSet": "n is an ordinal set position",
  "routineDiff.setRemoved": "n is an ordinal set position",
  "routineDiff.rest": "rest durations as preformatted text",
  "healthEdit.updates": "name, label or text value, not a count",
  "healthEdit.watch": "name, label or text value, not a count",
  "healthEdit.writeOff": "name, label or text value, not a count",
  "editWorkout.was": "date, time, rating or measured value, not a counted noun",
  "editWorkout.cellLabel": "not a counted noun",
  "plates.fewer": "weight or unit value, not a count",
  "plates.more": "weight or unit value, not a count",
  "oneRm.from": "name, label or text value, not a count",
  "oneRm.footnote": "weight or unit value, not a count",
  "oneRm.roundBar": "weight or unit value, not a count",
  "muscleMap.setsPerWeek": "call site passes a preformatted decimal string, not a number",
  "muscleMap.sets": "call site passes a preformatted decimal string, not a number",
  "muscleMap.counts": "date, time, rating or measured value, not a counted noun",
  "mergeDup.since": "date, time, rating or measured value, not a counted noun",
  "mergeDup.keepMeta": "several counted nouns in one string; phrased via the translation prompt",
  "mergeDup.combined": "several counted nouns in one string; phrased via the translation prompt",
  "mergeDup.mergeInto": "name, label or text value, not a count",
  "mergeDup.prLine": "not a counted noun",
  "mergeDup.emptyBody": "name, label or text value, not a count",
  "profiles.inWorkout": "date, time, rating or measured value, not a counted noun",
  "profiles.lastDay": "date, time, rating or measured value, not a counted noun",
  "profiles.copyTheirs": "name, label or text value, not a count",
  "profiles.footerWhose": "name, label or text value, not a count",
  "profiles.footer": "name, label or text value, not a count",
  "profiles.possessive": "name, label or text value, not a count",
  "profiles.deleteLead": "name, label or text value, not a count",
  "profiles.finishTheirs": "name, label or text value, not a count",
  "profiles.finishLead": "name, label or text value, not a count",
  "profiles.finishTail": "name, label or text value, not a count",
  "profiles.reorderLabel": "name, label or text value, not a count",
  "profiles.rowLabel": "name, label or text value, not a count",
  "profiles.duplicate": "name, label or text value, not a count",
  "profiles.rowOff": "name, label or text value, not a count",
  "deleteProfile.deleteFailed": "name, label or text value, not a count",
  "deleteProfile.alertTitle": "name, label or text value, not a count",
  "deleteProfile.alertBody": "name, label or text value, not a count",
  "deleteProfile.title": "name, label or text value, not a count",
  "deleteProfile.bodyPlain": "name, label or text value, not a count",
  "deleteProfile.exportLabel": "name, label or text value, not a count",
  "deleteProfile.exportButton": "name, label or text value, not a count",
  "deleteProfile.deleteButton": "name, label or text value, not a count",
  "switcher.announce": "name, label or text value, not a count",
  "switcher.rowLabel": "name, label or text value, not a count",
  "rest.seconds": "abbreviated unit (s), no noun to agree",
  "routineEdit.replaceLabel": "name, label or text value, not a count",
  "routineEdit.removeLabel": "name, label or text value, not a count",
  "routineEdit.leaveLabel": "name, label or text value, not a count",
  "routineEdit.ssWith": "name, label or text value, not a count",
  "routineView.then": "name, label or text value, not a count",
  "routineView.restAfterRound": "date, time, rating or measured value, not a counted noun",
  "routineView.rest": "date, time, rating or measured value, not a counted noun",
  "routineView.lastWithDuration": "date, time, rating or measured value, not a counted noun",
  "routineView.last": "date, time, rating or measured value, not a counted noun",
  "routineView.colTarget": "weight or unit value, not a count",
  "library.noMatch": "name, label or text value, not a count",
  "library.aboutLabel": "name, label or text value, not a count",
  "exerciseDetail.perMonth": "weight or unit value, not a count",
  "exerciseDetail.pointLabel": "ordinal position label",
  "health.offFor": "name, label or text value, not a count",
  "health.offBody": "name, label or text value, not a count",
  "health.offLine": "name, label or text value, not a count",
  "health.disconnectTitle": "name, label or text value, not a count",
  "health.nextRich": "name, label or text value, not a count",
  "health.linked": "name, label or text value, not a count",
  "health.deviceAsked": "not a counted noun",
  "health.receiving": "date, time, rating or measured value, not a counted noun",
  "settings.effortOption": "name, label or text value, not a count",
  "settings.following": "name, label or text value, not a count",
  "settings.managePerson": "name, label or text value, not a count",
  "settings.exportWhose": "name, label or text value, not a count",
  "settings.importInto": "name, label or text value, not a count",
  "settings.inHistory": "name, label or text value, not a count",
  "settings.privacyBody": "name, label or text value, not a count",
  "settings.aboutBody": "name, label or text value, not a count",
  "import.supported": "name, label or text value, not a count",
  "import.unitUnknown": "weight or unit value, not a count",
  "import.into": "name, label or text value, not a count",
  "import.asUnit": "weight or unit value, not a count",
  "import.doneStats": "several counted nouns in one string; phrased via the translation prompt",
  "import.partialFail": "created/attempted are an \"X of Y\" ratio with no counted noun",
  "startFlow.body": "name, label or text value, not a count",
  "demo.attribution": "name, label or text value, not a count",
  "demo.source": "name, label or text value, not a count",
  "musclePicker.noMatch": "name, label or text value, not a count",

};

test('every single-form placeholder entry is tagged plural or explicitly allowlisted', () => {
  for (const [k, v] of Object.entries(strings)) {
    if (/_(one|other)$/.test(k) || `${k}_one` in strings || ph(v.en).length === 0) continue;
    if (v.plural !== undefined) {
      assert.ok(!(k in NOT_A_COUNT), `${k}: tagged but still allowlisted`);
    } else {
      assert.ok(k in NOT_A_COUNT, `${k}: has a placeholder but is neither tagged plural nor in NOT_A_COUNT`);
    }
  }
  for (const k of Object.keys(NOT_A_COUNT)) assert.ok(k in strings, `${k}: stale allowlist entry`);
});
