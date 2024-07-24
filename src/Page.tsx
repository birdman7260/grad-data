import { PropsWithChildren, ReactNode } from 'react';

import { CarouselItem } from './components/ui/carousel';

type PageProps = {
  title: string;
  subTitle?: string;
  description?: string | ReactNode;
};

function Page({
  title,
  subTitle,
  description,
  children,
}: PropsWithChildren<PageProps>) {
  return (
    <CarouselItem className='carousel-item flex h-full flex-col items-stretch'>
      <div className='hero bg-base-200'>
        <div className='hero-content text-center'>
          <div className='max-w-md'>
            <h1 className='text-5xl font-bold'>{title}</h1>
            {subTitle ? <h2 className='font-bold'>{subTitle}</h2> : ''}
            {description ? <p className='py-6'>{description}</p> : ''}
          </div>
        </div>
      </div>
      <div className='grid grow content-center'>{children}</div>
    </CarouselItem>
  );
}

export default Page;
