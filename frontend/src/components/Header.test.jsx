import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';

function renderHeader(props) {
  return render(
    <MemoryRouter>
      <Header {...props} />
    </MemoryRouter>
  );
}

describe('Header', () => {
  it('renders breadcrumb text', () => {
    renderHeader({ breadcrumbs: [{ label: 'Dashboard' }] });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders multiple breadcrumbs with separators', () => {
    renderHeader({
      breadcrumbs: [
        { label: 'Projects', path: '/projects' },
        { label: 'My Project' },
      ],
    });
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it('renders linked breadcrumb as a link', () => {
    renderHeader({ breadcrumbs: [{ label: 'Home', path: '/' }] });
    const link = screen.getByText('Home');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders non-linked breadcrumb as plain text', () => {
    renderHeader({ breadcrumbs: [{ label: 'Current Page' }] });
    const text = screen.getByText('Current Page');
    expect(text.tagName).toBe('SPAN');
  });

  it('renders title when provided', () => {
    renderHeader({ breadcrumbs: [], title: 'Page Title' });
    expect(screen.getByText('Page Title')).toBeInTheDocument();
  });

  it('does not render title when not provided', () => {
    renderHeader({ breadcrumbs: [{ label: 'Test' }] });
    const title = document.querySelector('.header-title');
    expect(title).toBeNull();
  });

  it('renders with empty breadcrumbs', () => {
    renderHeader({ breadcrumbs: [] });
    expect(document.querySelector('.app-header')).toBeInTheDocument();
  });
});
