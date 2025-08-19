# signature/views/saved_signature.py
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from django.http import FileResponse, Http404
import mimetypes
import logging

from ..models import SavedSignature
from ..serializers import SavedSignatureSerializer

logger = logging.getLogger(__name__)


class SavedSignatureViewSet(viewsets.ModelViewSet):
    """
    Gestion des signatures enregistrées de l'utilisateur.
    - Liste/CRUD standards (router DRF)
    - /saved-signatures/{id}/image/ : sert l'image en clair (via storage.open)
    """
    serializer_class = SavedSignatureSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        # On restreint aux signatures du user connecté
        return SavedSignature.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        # Autorise upload (multipart) et data_url (JSON)
        data = request.data.copy()
        if 'kind' not in data:
            data['kind'] = 'upload' if request.FILES.get('image') else 'draw'
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['get'], url_path='image', url_name='image')
    def image(self, request, pk=None):
        """
        Renvoie l'image déchiffrée.
        IMPORTANT : on lit via sig.image.storage.open(...) pour passer par le storage chiffré.
        """
        sig = self.get_object()  # déjà filtré par get_queryset -> sécurité OK
        if not sig.image:
            raise Http404("Image introuvable")

        try:
            fh = sig.image.storage.open(sig.image.name, 'rb')  # <- déchiffre ici
        except Exception as e:
            logger.exception("Impossible d'ouvrir l'image de signature")
            return Response({'detail': f'Ouverture impossible: {e}'}, status=500)

        ctype = mimetypes.guess_type(sig.image.name)[0] or 'application/octet-stream'
        resp = FileResponse(fh, content_type=ctype)
        filename = sig.image.name.split('/')[-1]
        resp['Content-Disposition'] = f'inline; filename="{filename}"'
        # désactive le cache navigateur pour éviter les soucis en dev
        resp['Cache-Control'] = 'private, max-age=0, no-cache, no-store, must-revalidate'
        resp['Pragma'] = 'no-cache'
        return resp
