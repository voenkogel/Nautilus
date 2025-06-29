import React from 'react';

interface CardProps {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
}

const Card: React.FC<CardProps> = ({ x, y, width, height, title, subtitle }) => {
  return { x, y, width, height, title, subtitle };
};

export default Card;
export type { CardProps };