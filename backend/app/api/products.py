import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import ProductCreate, ProductResponse, ProductUpdate
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=list[ProductResponse])
async def list_products(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Lists the workspace's products by name, each with how many contacts are interested in it."""
    return await ProductService.list(db=db, workspace_id=user.workspace_id)


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(data: ProductCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Creates a product (name unique ignoring case: 409; up to 20 keywords; `color` as `#rrggbb`, picked when omitted).
    Existing chats are re-analysed in the background, so interested contacts appear over the next seconds.
    """
    product = await ProductService.create(db=db, workspace_id=user.workspace_id, data=data)
    ProductService.schedule_workspace(user.workspace_id)
    return await ProductService.response(db, product)


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(product_id: uuid.UUID, data: ProductUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Renames a product or changes its description, keywords, or color; chats are re-analysed in the background."""
    product = await ProductService.update(db=db, workspace_id=user.workspace_id, product_id=product_id, data=data)
    ProductService.schedule_workspace(user.workspace_id)
    return await ProductService.response(db, product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Deletes a product and removes it from every contact."""
    await ProductService.delete(db=db, workspace_id=user.workspace_id, product_id=product_id)
