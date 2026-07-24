import Link from 'next/link';
import { etiquetasPost, formatearFecha, hrefAutorBlog } from '../lib/blogApi';

export default function PostCard({
  post,
  interactive = true,
  authorIsPublic = false,
  className = '',
  onImageError,
  onImageLoad,
}) {
  const title = post?.titulo || 'Título del blog';
  const href = `/blog/${post?.slug || ''}`;
  const classes = ['post', className].filter(Boolean).join(' ');

  return (
    <article className={classes}>
      {interactive ? (
        <Link href={href} className="post-cover-link" aria-label={`Leer ${title}`}>
          <PostCover post={post} />
        </Link>
      ) : (
        <PostCover post={post} onImageError={onImageError} onImageLoad={onImageLoad} />
      )}
      <div className="post-body">
        <div className="post-tags" aria-label="Tags">
          {etiquetasPost(post).slice(0, 3).map((tag) => (
            <span className="post-cat" key={tag}>{tag}</span>
          ))}
        </div>
        <h4>
          {interactive ? <Link href={href} className="post-title-link">{title}</Link> : title}
        </h4>
        {post?.extracto && <p className="post-excerpt">{post.extracto}</p>}
        <div className="meta">
          {post?.autor && (
            <>
              {interactive && authorIsPublic ? (
                <Link href={hrefAutorBlog(post.autor)} className="post-author">{post.autor}</Link>
              ) : (
                <span className="post-author-name">{post.autor}</span>
              )}
              {' - '}
            </>
          )}
          {formatearFecha(post?.fecha)}
        </div>
      </div>
    </article>
  );
}

function PostCover({ post, onImageError, onImageLoad }) {
  return (
    <div
      className="post-img"
      style={post?.imagen ? { backgroundImage: `url('${post.imagen}')` } : {}}
    >
      {post?.imagen && (onImageError || onImageLoad) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="admin-cover-probe"
          onError={onImageError}
          onLoad={onImageLoad}
          src={post.imagen}
        />
      )}
    </div>
  );
}
