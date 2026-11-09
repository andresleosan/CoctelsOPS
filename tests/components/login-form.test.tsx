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
    expect(screen.getByText(/¿Eres staff, bartender o admin\?/i)).toBeInTheDocument();
  });

  it('cambia a modo Staff al pulsar el botón de Acceso Staff', () => {
    render(<LoginForm />);

    const staffButton = screen.getByText(/¿Eres staff, bartender o admin\?/i).closest('button');
    expect(staffButton).not.toBeNull();
    fireEvent.click(staffButton!);

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
    expect(screen.getByRole('button', { name: /Ingresar al Panel Operativo/i })).toBeInTheDocument();

    const tabCliente = screen.getByRole('button', { name: /^Cliente$/i });
    fireEvent.click(tabCliente);

    expect(screen.queryByText(/Acceso Operativo/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Ingresar$/i })).toBeInTheDocument();
  });

  it('en modo Staff redirige a /admin/dashboard tras login exitoso por correo', async () => {
    loginWithEmail.mockResolvedValue({
      user: {
        getIdTokenResult: () => Promise.resolve({ claims: { admin: true } }),
      },
    });

    render(<LoginForm initialRole="staff" />);

    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'andres.san1404@gmail.com' },
    });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Ingresar al Panel Operativo/i }));

    await waitFor(() => {
      expect(loginWithEmail).toHaveBeenCalledWith('andres.san1404@gmail.com', 'password123');
      expect(mockPush).toHaveBeenCalledWith('/admin/dashboard');
    });
  });

  it('en modo Staff redirige a /admin/dashboard tras login exitoso con Google', async () => {
    loginWithGoogle.mockResolvedValue({
      user: {
        getIdTokenResult: () => Promise.resolve({ claims: { admin: true } }),
      },
    });

    render(<LoginForm initialRole="staff" />);

    fireEvent.click(screen.getByRole('button', { name: /Continuar con Google \(Staff\)/i }));

    await waitFor(() => {
      expect(loginWithGoogle).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/admin/dashboard');
    });
  });
});
