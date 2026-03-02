import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import socket from '../socket';

function SortableItem({ video, index }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function remove() {
    socket.emit('queue:remove', { index });
  }

  return (
    <li ref={setNodeRef} style={style} className="queue-item">
      <span className="drag-handle" {...attributes} {...listeners}>
        ⠿
      </span>
      <span className="queue-name" title={video.originalName}>
        {video.originalName}
      </span>
      <button className="btn btn-sm btn-ghost" onClick={remove} title="Remove">
        ✕
      </button>
    </li>
  );
}

export default function Queue({ queue }) {
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = queue.findIndex((v) => v.id === active.id);
    const toIndex = queue.findIndex((v) => v.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;

    socket.emit('queue:reorder', { fromIndex, toIndex });
  }

  function handleNext() {
    socket.emit('queue:next', {});
  }

  return (
    <div className="queue">
      <div className="queue-header">
        <h2>Up Next ({queue.length})</h2>
        {queue.length > 0 && (
          <button className="btn btn-sm" onClick={handleNext}>
            Skip →
          </button>
        )}
      </div>

      {queue.length === 0 && (
        <p className="empty-hint">Queue is empty. Add videos from the library.</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={queue.map((v) => v.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="queue-list">
            {queue.map((video, index) => (
              <SortableItem key={video.id} video={video} index={index} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
