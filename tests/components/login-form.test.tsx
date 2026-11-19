/* eslint-disable @next/next/no-img-element */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/image', () => ({
  default: (props: { alt?: string; src?: string }) => (
    <img alt={props.alt ?? ''} src={props.src ?? ''} />
  ),
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

import { AuthLoginCard } from '@/components/auth/AuthLoginCard';
import AuthShowcase from '@/components/auth/AuthShowcase';
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

  it('incluye enlace accesible "Volver a la tienda" apuntando a /', () => {
    render(<LoginForm />);

    const backLink = screen.getByRole('link', { name: /Volver a la tienda/i });
    expect(backLink).toHaveAttribute('href', '/');
  });

  it('permite alternar la visibilidad de la contraseña sin romper el label del input', () => {
    render(<LoginForm />);

    const passwordInput = screen.getByLabelText(/Contraseña/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleButton = screen.getByRole('button', { name: /Mostrar clave/i });
    fireEvent.click(toggleButton);

    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: /Ocultar clave/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('AuthLoginCard sincronización de encabezado y redirección', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('sincroniza título e identidad al cambiar de Staff & Barra a Cliente y redirige cliente a /', async () => {
    loginWithEmail.mockResolvedValueOnce({
      user: {
        getIdTokenResult: async () => ({ claims: {} }),
      },
    });

    render(<AuthLoginCard initialRole="staff" staffRedirectTo="/admin/dashboard" />);

    expect(screen.getByText('Acceso Operativo Staff')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cliente/i }));

    expect(screen.queryByText('Acceso Operativo Staff')).toBeNull();
    expect(screen.getByText('INGRESAR A OPS')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), {
      target: { value: 'cliente@correo.com' },
    });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), {
      target: { value: 'cliente123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Ingresar$/i }));

    await waitFor(() => {
      expect(loginWithEmail).toHaveBeenCalledWith('cliente@correo.com', 'cliente123');
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
});

describe('AuthShowcase', () => {
  afterEach(() => {
    cleanup();
  });

  it('renderiza los 5 sabores reales y permite cambiar de sabor con las pestañas', () => {
    render(<AuthShowcase />);

    expect(screen.getByRole('heading', { name: 'Fresa Salvaje' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ver Fresa Salvaje' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Ver Mango Biche Special' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ver Explosión de Maracuyá' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ver Coco Loco Tropical' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ver Lulo Refrescante' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Ver Lulo Refrescante' }));

    expect(screen.getByRole('heading', { name: 'Lulo Refrescante' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ver Lulo Refrescante' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Ver Fresa Salvaje' })).toHaveAttribute('aria-selected', 'false');
  });
});
