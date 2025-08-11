from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'user', 'envelope', 'ip_address', 'created_at')
    search_fields = ('action', 'user__username', 'envelope__title', 'ip_address')
    list_filter = ('action', 'created_at')
