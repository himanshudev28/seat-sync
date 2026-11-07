import { describe, it, expect } from 'vitest';
import { pickEventFields, pickTicketSettings } from '../_fields.js';

describe('pickTicketSettings', () => {
  it('fills defaults for anything left out', () => {
    expect(pickTicketSettings({})).toEqual({
      issuer: null,
      show_holder: true,
      show_student_id: true,
      show_course: true,
      student_id_label: 'Student ID',
      course_label: 'Course',
      note: null,
    });
  });

  it('keeps the admin choices, trimmed', () => {
    const s = pickTicketSettings({
      issuer: '  Invertis University ',
      show_holder: false,
      show_student_id: true,
      show_course: false,
      student_id_label: 'Roll No.',
      course_label: '',
      note: 'Bring your college ID card',
    });
    expect(s).toMatchObject({
      issuer: 'Invertis University',
      show_holder: false,
      show_course: false,
      student_id_label: 'Roll No.',
      course_label: 'Course', // blank label falls back
      note: 'Bring your college ID card',
    });
  });

  it.each([
    ['not an object', 'yes'],
    ['an array', []],
    ['a non-boolean toggle', { show_course: 'no' }],
    ['an over-long label', { student_id_label: 'x'.repeat(41) }],
    ['an over-long note', { note: 'x'.repeat(161) }],
    ['a non-string issuer', { issuer: 42 }],
  ])('rejects %s', (_name, v) => {
    expect(() => pickTicketSettings(v)).toThrow();
  });

  it('is only written when sent, so a partial update leaves it alone', () => {
    expect(pickEventFields({ title: 'x' }, true)).not.toHaveProperty('ticket_settings');
    expect(pickEventFields({ ticket_settings: { note: 'Gate 3' } }, true).ticket_settings).toMatchObject({ note: 'Gate 3' });
  });
});
