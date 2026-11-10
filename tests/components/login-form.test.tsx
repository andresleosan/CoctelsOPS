import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const { loginWithEmail, loginWithGoogle } = vi.hoisted(() => ({
  loginWithEmail: vi.fn(),
  loginWithGoogle: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  loginWithEmail,
  loginWithGoogle,
  translateAuthError: (err: unknown) => (err instanceof Error ? err.message : 'Error de autenticación'),
}));

import { LoginForm } from '@/components/auth/LoginForm';

describe('LoginForm con diferenciación de Staff & Barra', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('inicia en modo Cliente por defecto con botón de Acceso Staff visible', () => {
    render(<LoginForm />);

    expect(screen.getByRole('button', { name: /Cliente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Staff & Barra/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ingresar$/i })).toBeInTheDocument();
  });

  it('cambia a modo Staff al pulsar el botón de Acceso Staff', () => {
    render(<LoginForm />);

    const staffTab = screen.getByRole('button', { name: /Staff & Barra/i });
    expect(staffTab).not.toBeNull();
    fireEvent.click(staffTab);

    // Now in staff mode
    expect(screen.getByText(/Acceso Operativo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ingresar al Panel Operativo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar con Google \(Staff\)/i })).toBeInTheDocument();
  });

  it('permite conmutar directamente con las pestañas superiores', () => {
    render(<LoginForm />);

    const tabStaff = screen.getByRole('button', { name: /Staff & Barra/i });
    fireEvent.click(tabStaff);

    expect(screen.getByText(/Acceso Operativo/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/staff@coctelsops\.com/i)).toBeInTheDocument();

    const tabCliente = screen.getByRole('button', { name: /Cliente/i });
    fireEvent.click(tabCliente);

    expect(screen.queryByText(/Acceso Operativo/i)).toBeNull();
    expect(screen.getByPlaceholderText(/tu@correo\.com/i)).toBeInTheDocument();
  });

  it('en modo Staff redirige a /admin/dashboard tras login exitoso por correo', async () => {
    loginWithEmail.mockResolvedValueOnce({
      user: {
        getIdTokenResult: async () => ({ claims: { role: 'staff', staff: true } }),
      },
    });

    render(<LoginForm initialRole="staff" />);

    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'bartender@coctelsops.com' },
    });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Ingresar al Panel Operativo/i }));

    await waitFor(() => {
      expect(loginWithEmail).toHaveBeenCalledWith('bartender@coctelsops.com', 'password123');
      expect(mockPush).toHaveBeenCalledWith('/admin/dashboard');
    });
  });

  it('en modo Staff redirige a /admin/dashboard tras login exitoso con Google', async () => {
    loginWithGoogle.mockResolvedValueOnce({
      user: {
        getIdTokenResult: async () => ({ claims: { admin: true } }),
      },
    });

    render(<LoginForm initialRole="staff" />);

    fireEvent.click(screen.getByRole('button', { name: /Continuar con Google \(Staff\)/i }));

    await waitFor(() => {
      expect(loginWithGoogle).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/admin/dashboard');
    });
  });
});
