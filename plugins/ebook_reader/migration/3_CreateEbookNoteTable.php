<?php
use SLiMS\Table\Schema;
use SLiMS\Table\Blueprint;

class CreateEbookNoteTable extends \SLiMS\Migration\Migration
{
    function up()
    {
        Schema::create('ebook_note', function (Blueprint $table) {
            $table->engine    = 'MyISAM';
            $table->charset   = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';
            $table->autoIncrement('id');
            $table->number('member_id', 11)->notNull();
            $table->number('biblio_id', 11)->notNull();
            $table->number('file_id',   11)->notNull();
            $table->text('location')->notNull();   /* EPUB CFI range */
            $table->text('excerpt');               /* selected text snippet */
            $table->text('note_text');
            $table->string('color', 20)->default('yellow');
            $table->datetime('created_at')->notNull();
            $table->index('member_id');
        });
    }

    function down()
    {
        Schema::drop('ebook_note');
    }
}
