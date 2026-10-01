export interface Category {
  icon: string;
  id: string;
  name: string;
  nameDE?: string | null;
}

export const categoryLabel = (c: Category) => `${c.icon} ${c.nameDE || c.name}`;

export interface Account {
  icon: string;
  id: string;
  name: string;
}

export const accountLabel = (a: Account) => `${a.icon} ${a.name}`;
