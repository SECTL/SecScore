use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "student_tags")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub student_id: i32,
    pub tag_id: i32,
    pub created_at: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::students::Entity",
        from = "Column::StudentId",
        to = "super::students::Column::Id"
    )]
    Student,
    #[sea_orm(
        belongs_to = "super::tags::Entity",
        from = "Column::TagId",
        to = "super::tags::Column::Id"
    )]
    Tag,
}

impl Related<super::students::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Student.def()
    }
}

impl Related<super::tags::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Tag.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
