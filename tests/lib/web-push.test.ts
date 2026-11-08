import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationPermission,
  isPushNotificationSupported,
  playOrderNotificationSound,
  urlBase64ToUint8Array,
} from "@/lib/notifications/web-push";

describe("web-push lib utilities", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  describe("urlBase64ToUint8Array", () => {
    it("convierte una clave base64 url-safe a Uint8Array correctamente", () => {
      // "hello" in base64 is "aGVsbG8="
      const result = urlBase64ToUint8Array("aGVsbG8");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
    });
  });

  describe("isPushNotificationSupported y getNotificationPermission", () => {
    it("retorna true cuando serviceWorker, PushManager y Notification están presentes", () => {
      // In jsdom environment, let's mock the properties
      Object.defineProperty(window.navigator, "serviceWorker", {
        value: {},
        configurable: true,
      });
      Object.defineProperty(window, "PushManager", {
        value: function () {},
        configurable: true,
      });
      Object.defineProperty(window, "Notification", {
        value: { permission: "default" },
        configurable: true,
      });

      expect(isPushNotificationSupported()).toBe(true);
      expect(getNotificationPermission()).toBe("default");
    });

    it("retorna 'unsupported' cuando no se soportan las APIs", () => {
      // Remove PushManager
      // @ts-expect-error test override
      delete window.PushManager;

      expect(isPushNotificationSupported()).toBe(false);
      expect(getNotificationPermission()).toBe("unsupported");
    });
  });

  describe("playOrderNotificationSound", () => {
    it("no lanza errores al ejecutarse con AudioContext mockeado o no disponible", () => {
      const mockOscillator = {
        type: "sine",
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };

      class MockAudioContext {
        currentTime = 0;
        createOscillator = vi.fn().mockReturnValue(mockOscillator);
        createGain = vi.fn().mockReturnValue(mockGain);
        destination = {};
      }

      // @ts-expect-error test mock
      window.AudioContext = MockAudioContext;

      expect(() => playOrderNotificationSound()).not.toThrow();
      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
    });
  });
});
