import { loginSchema, documentUploadSchema, registerStep1Schema, notificationSettingsSchema, passwordResetSchema, profileSchema, passwordChangeSchema } from './schemas';

describe('Validation schemas', () => {
  test('login schema requires username and password', async () => {
    await expect(loginSchema.isValid({ username: '', password: '' })).resolves.toBe(false);
    await expect(loginSchema.isValid({ username: 'u', password: 'p' })).resolves.toBe(true);
  });

  test('document upload schema requires title and pdf file', async () => {
    const file = { name: 'test.pdf', size: 1000 };
    await expect(documentUploadSchema.isValid({ title: '', files: [] })).resolves.toBe(false);
    await expect(documentUploadSchema.isValid({ title: 'Doc', files: [file] })).resolves.toBe(true);
  });

  test('register step1 enforces email and password length', async () => {
    await expect(registerStep1Schema.isValid({ username: 'u', email: 'bad', password: '123' })).resolves.toBe(false);
    await expect(registerStep1Schema.isValid({ username: 'u', email: 'test@test.com', password: '12345' })).resolves.toBe(true);
  });

  test('notification settings require at least one channel', async () => {
    await expect(notificationSettingsSchema.isValid({ email: false, sms: false, push: false })).resolves.toBe(false);
    await expect(notificationSettingsSchema.isValid({ email: true, sms: false, push: false })).resolves.toBe(true);
  });

  test('password reset schema validates email', async () => {
    await expect(passwordResetSchema.isValid({ email: 'bad' })).resolves.toBe(false);
    await expect(passwordResetSchema.isValid({ email: 'good@mail.com' })).resolves.toBe(true);
  });

  test('profile schema requires first and last name', async () => {
    await expect(profileSchema.isValid({ first_name: '', last_name: '' })).resolves.toBe(false);
    await expect(profileSchema.isValid({ first_name: 'A', last_name: 'B' })).resolves.toBe(true);
  });

  test('password change schema requires old and new password', async () => {
    await expect(passwordChangeSchema.isValid({ old_password: '', new_password: '123' })).resolves.toBe(false);
    await expect(passwordChangeSchema.isValid({ old_password: 'old', new_password: '12345' })).resolves.toBe(true);
  });
});
