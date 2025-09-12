import sanitize from './sanitize';

describe('sanitize', () => {
  test('removes script tags', () => {
    const dirty = '<div>hello<script>alert("x")</script></div>';
    expect(sanitize(dirty)).toBe('<div>hello</div>');
  });

  test('handles null and undefined', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
  });
});

