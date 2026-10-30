"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, type Item } from "@/lib/api";

export function ItemsPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listItems()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const item = await api.createItem(name.trim());
      setItems((prev) => [item, ...prev]);
      setName("");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Itens</CardTitle>
        <CardDescription>Dados salvos no Neon via API Python.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Novo item"
          />
          <Button type="submit">Adicionar</Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                {item.name}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${item.name}`}
                  onClick={() => handleDelete(item.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
