export interface Category {
  icon: string;
  id: string;
  name: string;
  nameDE?: string | null;
}

export const categoryLabel = (c: Category) => `${c.icon} ${c.nameDE || c.name}`;
