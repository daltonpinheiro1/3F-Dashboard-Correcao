/** O agregado não é arquivo estático. Sem sessão devolve 404, nunca o JSON. */
export const onRequest: PagesFunction = async () => {
  return new Response(JSON.stringify({ error: 'Conciliação não publicada neste endereço.' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
