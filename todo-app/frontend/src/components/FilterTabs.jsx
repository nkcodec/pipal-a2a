import './FilterTabs.css'

function FilterTabs({ filter, onFilterChange, activeCount }) {
  return (
    <div className="filter-tabs">
      <div className="tabs">
        <button
          className={`tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          All
        </button>
        <button
          className={`tab ${filter === 'active' ? 'active' : ''}`}
          onClick={() => onFilterChange('active')}
        >
          Active
        </button>
        <button
          className={`tab ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => onFilterChange('completed')}
        >
          Completed
        </button>
      </div>
      <span className="count">{activeCount} item{activeCount !== 1 ? 's' : ''} left</span>
    </div>
  )
}

export default FilterTabs
