import * as Yup from 'yup';

export const loginSchema = Yup.object({
  username: Yup.string().required("Nom d'utilisateur requis"),
  password: Yup.string().required('Mot de passe requis'),
});

export const documentUploadSchema = Yup.object({
  title: Yup.string().required('Titre requis'),
  files: Yup.array()
    .min(1, 'Au moins un fichier')
    .test('fileSize', 'Le fichier est trop volumineux (max 10MB)',
      (files = []) => files.every(f => f.size <= 10 * 1024 * 1024))
    .test('fileType', 'Seuls les fichiers PDF sont autorisés',
      (files = []) => files.every(f => f.name && f.name.toLowerCase().endsWith('.pdf')))
    .test('fileNotEmpty', 'Le fichier est vide',
      (files = []) => files.every(f => f.size > 0)),
});

export const registerStep1Schema = Yup.object({
  username: Yup.string().required("Nom d'utilisateur requis"),
  email: Yup.string().email('Email invalide').required('Email requis'),
  password: Yup.string().min(5, 'Minimum 5 caractères').required('Mot de passe requis'),
});

export const registerStep2Schema = Yup.object({
  first_name: Yup.string().required('Prénom requis'),
  last_name: Yup.string().required('Nom requis'),
  birth_date: Yup.string().required('Date de naissance requise'),
  phone_number: Yup.string(),
  gender: Yup.string(),
  address: Yup.string(),
  avatar: Yup.mixed().nullable(),
});

export const profileSchema = Yup.object({
  first_name: Yup.string().required('Prénom requis'),
  last_name: Yup.string().required('Nom requis'),
  birth_date: Yup.string().nullable(),
  phone_number: Yup.string().nullable(),
  gender: Yup.string().nullable(),
  address: Yup.string().nullable(),
  avatar: Yup.mixed().nullable(),
});

export const passwordChangeSchema = Yup.object({
  old_password: Yup.string().required('Ancien mot de passe requis'),
  new_password: Yup.string().min(5, 'Minimum 5 caractères').required('Nouveau mot de passe requis'),
});

export const notificationSettingsSchema = Yup.object({
  email: Yup.boolean(),
  sms: Yup.boolean(),
  push: Yup.boolean(),
}).test('atLeastOne', 'Sélectionnez au moins un canal', value => value.email || value.sms || value.push);

export const passwordResetSchema = Yup.object({
  email: Yup.string().email('Email invalide').required('Email requis'),
});
