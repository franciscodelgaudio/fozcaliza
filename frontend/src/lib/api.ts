const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Item = {
  id: number;
  name: string;
  created_at: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Erro ${res.status} em ${path}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  listItems: () => request<Item[]>("/items"),
  createItem: (name: string) =>
    request<Item>("/items", { method: "POST", body: JSON.stringify({ name }) }),
  deleteItem: (id: number) => request<void>(`/items/${id}`, { method: "DELETE" }),
};
