import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocumentDetail from './DocumentDetail';
import signatureService from '../services/signatureService';
import useIsMobile from '../hooks/useIsMobile';
import { toast } from 'react-toastify';

const mockNavigate = jest.fn();

jest.mock('react-pdf', () => ({
  Document: ({ children }) => <div data-testid="pdf-document">{children}</div>,
  Page: () => <div data-testid="pdf-page" />
}));

jest.mock('../hooks/useFocusTrap', () => jest.fn());

jest.mock('../hooks/useIsMobile');
jest.mock('../services/signatureService', () => ({
  getEnvelope: jest.fn(),
  downloadEnvelope: jest.fn(),
  restoreEnvelope: jest.fn(),
  purgeEnvelope: jest.fn(),
  remindNow: jest.fn()
}));
jest.mock('../services/logService', () => ({
  error: jest.fn()
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

const DOC_UUID = '123e4567-e89b-12d3-a456-426614174000';

jest.mock('react-router-dom', () => ({
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
  useParams: () => ({ doc_uuid: DOC_UUID }),
  useNavigate: () => mockNavigate
}));

const cancelledEnvelope = {
  id: '123',
  doc_uuid: DOC_UUID,
  title: 'Annulée',
  status: 'cancelled',
  version: 1,
  created_at: '2023-01-01T00:00:00Z',
  deadline_at: null,
  flow_type: 'sequential',
  recipients: [],
  completion_rate: 0,
  documents: [
    {
      id: 'doc-1',
      name: 'Document 1'
    }
  ]
};

const restoredEnvelope = {
  ...cancelledEnvelope,
  status: 'draft'
};

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigate.mockReset();
  useIsMobile.mockReturnValue(false);
  signatureService.downloadEnvelope.mockResolvedValue({ download_url: 'http://example.com/doc.pdf' });
  signatureService.remindNow.mockResolvedValue({ reminders: 0 });
});

test('restores a cancelled envelope and refreshes the view', async () => {
  signatureService.getEnvelope
    .mockResolvedValueOnce(cancelledEnvelope)
    .mockResolvedValueOnce(restoredEnvelope);
  signatureService.restoreEnvelope.mockResolvedValue();

  const user = userEvent.setup();
  render(<DocumentDetail />);

  await waitFor(() => expect(signatureService.getEnvelope).toHaveBeenCalledTimes(1));

  const restoreButton = await screen.findByRole('button', { name: 'Restaurer' });
  await user.click(restoreButton);

  await waitFor(() => expect(signatureService.restoreEnvelope).toHaveBeenCalledWith(DOC_UUID));
  expect(toast.success).toHaveBeenCalledWith('Enveloppe restaurée avec succès');

  await waitFor(() => expect(signatureService.getEnvelope).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Supprimer définitivement')).not.toBeInTheDocument());
});

test('purges a cancelled envelope after confirmation', async () => {
  signatureService.getEnvelope.mockResolvedValue(cancelledEnvelope);
  signatureService.purgeEnvelope.mockResolvedValue();

  const user = userEvent.setup();
  render(<DocumentDetail />);

  await waitFor(() => expect(signatureService.getEnvelope).toHaveBeenCalled());

  const deleteButton = await screen.findByRole('button', { name: 'Supprimer définitivement' });
  await user.click(deleteButton);

  const confirmButton = await screen.findByRole('button', { name: 'Purger' });
  await user.click(confirmButton);

  await waitFor(() => expect(signatureService.purgeEnvelope).toHaveBeenCalledWith(DOC_UUID));
  expect(toast.success).toHaveBeenCalledWith('Enveloppe purgée définitivement');
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/signature/envelopes/deleted'));
});
