from django.db import migrations, models
import django.db.models.deletion
import signature.storages


class Migration(migrations.Migration):

    dependencies = [
        ('signature', '0004_auditlog'),
    ]

    operations = [
        migrations.CreateModel(
            name='EnvelopeDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(storage=signature.storages.EncryptedFileSystemStorage(), upload_to='signature/documents/')),
                ('name', models.CharField(blank=True, max_length=255)),
                ('file_type', models.CharField(blank=True, max_length=50)),
                ('file_size', models.PositiveIntegerField(blank=True, null=True)),
                ('hash_original', models.CharField(blank=True, max_length=64)),
                ('version', models.PositiveIntegerField(default=1)),
                ('envelope', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='signature.envelope')),
            ],
        ),
        migrations.CreateModel(
            name='WebhookEndpoint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('url', models.URLField()),
                ('event', models.CharField(choices=[('envelope_sent', 'Envelope sent'), ('envelope_signed', 'Envelope signed'), ('envelope_cancelled', 'Envelope cancelled')], max_length=50)),
                ('secret', models.CharField(blank=True, max_length=255)),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.AlterField(
            model_name='envelope',
            name='document_file',
            field=models.FileField(blank=True, null=True, storage=signature.storages.EncryptedFileSystemStorage(), upload_to='signature/documents/'),
        ),
    ]
