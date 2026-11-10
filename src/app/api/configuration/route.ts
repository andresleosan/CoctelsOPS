import {
  getStoreConfiguration,
  StoreConfigurationUnavailableError,
} from "@/lib/firestore/configuration";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ configuration: await getStoreConfiguration({ allowDefaults: true }) });
  } catch (error) {
    if (error instanceof StoreConfigurationUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    return Response.json({ error: "No fue posible completar la solicitud" }, { status: 500 });
  }
}
